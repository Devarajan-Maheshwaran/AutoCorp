"""
Category 5 SaaS — Price Monitor Agent.
Watches SaaS licence marketplaces and domain auctions for resale opportunities.
"""

from __future__ import annotations

import asyncio
import os
import time

from autocorp.core.base_agent import BaseAgent
from autocorp.core.event_bus import publish
from autocorp.categories.category5_saas.tools import (
    SAAS_TOOLS,
    fetch_licence_prices,
    fetch_domain_listings,
    calculate_licence_margin,
    calculate_domain_roi,
)


POLL_INTERVAL = int(os.getenv("PRICE_POLL_INTERVAL", "30"))


class SaaSPriceMonitor(BaseAgent):
    """Monitors SaaS licence marketplaces and domain auctions."""

    def __init__(self, charter: dict):
        super().__init__("saas_price_monitor", charter, SAAS_TOOLS)
        self.system_prompt = self.build_system_prompt(
            role_description=(
                "You monitor SaaS licence resale marketplaces and domain auctions. "
                "Identify licences available below retail and domains at auction below "
                "estimated resale value."
            ),
            actions=[
                "CALL_TOOL | tool: fetch_licence_prices | args: {\"product\": \"<name>\"}",
                "CALL_TOOL | tool: fetch_domain_listings | args: {}",
                "CALL_TOOL | tool: calculate_licence_margin | args: {\"listings\": [...]}",
                "CALL_TOOL | tool: calculate_domain_roi | args: {\"domains\": [...]}",
                "PUBLISH_SPREAD | opportunity data",
                "WAIT — nothing actionable now",
            ],
        )

    async def run_loop(self):
        self.running = True
        product = self.charter.get("parameters", {}).get("product", "figma")
        min_margin = self.charter.get("parameters", {}).get("min_margin_pct", 20.0)

        print(f"[SaaSPriceMonitor] Starting for product={product}, min_margin={min_margin}%")

        while self.running:
            try:
                # Check licence resale prices
                licences = await fetch_licence_prices(product)
                licence_opps = calculate_licence_margin(licences)

                # Check domain auctions
                domains = await fetch_domain_listings()
                domain_opps = calculate_domain_roi(domains)

                best_licence = licence_opps[0] if licence_opps else {}
                best_domain = domain_opps[0] if domain_opps else {}

                observation = (
                    f"Licences: {len(licence_opps)} opportunities for {product}. "
                    f"Best margin: {best_licence.get('margin_pct', 0)}% "
                    f"({best_licence.get('marketplace', '?')}, "
                    f"${best_licence.get('bulk_price', 0):.2f}/seat → "
                    f"${best_licence.get('retail_price', 0):.2f} retail). "
                    f"Domains: {len(domain_opps)} opportunities. "
                    f"Best ROI: {best_domain.get('roi_pct', 0)}% "
                    f"({best_domain.get('domain', '?')}, "
                    f"${best_domain.get('cost', 0)} → est. ${best_domain.get('est_value', 0)})"
                )

                thought, action = await self.react_step(observation, self.system_prompt)

                # Publish if any opportunity meets threshold
                has_viable = (
                    (best_licence.get("margin_pct", 0) >= min_margin)
                    or (best_domain.get("roi_pct", 0) >= 100)
                    or "PUBLISH_SPREAD" in action
                )

                if has_viable:
                    await publish({
                        "type": "price_spread",
                        "category": "saas",
                        "agent": self.agent_name,
                        "product": product,
                        "licence_opportunities": licence_opps[:3],
                        "domain_opportunities": domain_opps[:3],
                        "thought": thought,
                        "ts": time.time(),
                    })
                    print(f"[SaaSPriceMonitor] Published: {len(licence_opps)} licence + {len(domain_opps)} domain opps")

            except Exception as e:
                print(f"[SaaSPriceMonitor] Error: {e}")

            await asyncio.sleep(POLL_INTERVAL)

    def stop(self):
        self.running = False
