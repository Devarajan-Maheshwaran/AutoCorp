"""
Category 5 SaaS — Procurement Agent.
Buys SaaS licences in bulk or acquires domains at auction.
"""

from __future__ import annotations

import asyncio
import time

from autocorp.core.base_agent import BaseAgent
from autocorp.core.blockchain import record_purchase
from autocorp.core.event_bus import publish, subscribe
from autocorp.categories.category5_saas.tools import SAAS_TOOLS


class SaaSProcurement(BaseAgent):
    """Listens for SaaS spread events and executes buy-side orders."""

    def __init__(self, charter: dict):
        super().__init__("saas_procurement", charter, SAAS_TOOLS)
        self.system_prompt = self.build_system_prompt(
            role_description=(
                "You are a SaaS procurement agent. When a licence or domain opportunity "
                "arrives, decide whether to buy. For licences, factor in the commitment "
                "period and seat utilisation risk. For domains, consider liquidity and "
                "time-to-sell."
            ),
            actions=[
                "CALL_TOOL | tool: fetch_licence_prices | args: {\"product\": \"<name>\"}",
                "BUY_LICENCE | marketplace: <name> | product: <name> | seats: <n> | price: <price_per_seat>",
                "BUY_DOMAIN | domain: <name> | price: <auction_price>",
                "SKIP — not worth executing",
            ],
        )
        self.budget = charter.get("parameters", {}).get("budget_usd", 5000)
        self.max_trade_pct = charter.get("parameters", {}).get("max_single_trade_pct", 20) / 100

    async def run_loop(self):
        self.running = True
        queue = await subscribe("price_spread")
        print(f"[SaaSProcurement] Listening, budget=${self.budget}")

        while self.running:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=60)
                if event.get("category") != "saas":
                    continue

                licence_opps = event.get("licence_opportunities", [])
                domain_opps = event.get("domain_opportunities", [])
                max_spend = self.budget * self.max_trade_pct

                # Summarise top opportunities
                lic_summary = ""
                if licence_opps:
                    top = licence_opps[0]
                    cost = top.get("bulk_price", 0) * top.get("seats", 0)
                    lic_summary = (
                        f"Top licence: {top.get('product', '?')} on {top.get('marketplace', '?')}, "
                        f"{top.get('seats', 0)} seats @ ${top.get('bulk_price', 0):.2f}/seat "
                        f"(retail ${top.get('retail_price', 0):.2f}), "
                        f"margin {top.get('margin_pct', 0):.1f}%, cost ${cost:.2f}."
                    )

                dom_summary = ""
                if domain_opps:
                    top_d = domain_opps[0]
                    dom_summary = (
                        f"Top domain: {top_d.get('domain', '?')} @ ${top_d.get('cost', 0)}, "
                        f"est. value ${top_d.get('est_value', 0)}, ROI {top_d.get('roi_pct', 0):.0f}%."
                    )

                observation = (
                    f"Budget: ${self.budget:.2f}, max per trade: ${max_spend:.2f}. "
                    f"{lic_summary} {dom_summary}"
                )

                thought, action = await self.react_step(observation, self.system_prompt)

                if "BUY_LICENCE" in action.upper() and licence_opps:
                    top = licence_opps[0]
                    cost = top.get("bulk_price", 0) * top.get("seats", 0)
                    self.budget -= cost

                    tx_hash = await record_purchase(
                        item=f"saas:{top.get('product', 'unknown')}",
                        quantity=top.get("seats", 0),
                        price_per_unit=top.get("bulk_price", 0),
                    )

                    await publish({
                        "type": "purchase_executed",
                        "category": "saas",
                        "sub_type": "licence",
                        "agent": self.agent_name,
                        "product": top.get("product"),
                        "marketplace": top.get("marketplace"),
                        "seats": top.get("seats"),
                        "price_per_seat": top.get("bulk_price"),
                        "cost": cost,
                        "retail_price": top.get("retail_price"),
                        "margin_pct": top.get("margin_pct"),
                        "tx_hash": tx_hash,
                        "remaining_budget": self.budget,
                        "thought": thought,
                        "ts": time.time(),
                    })
                    print(f"[SaaSProcurement] BUY licence: {top.get('product')} x{top.get('seats')} seats")

                elif "BUY_DOMAIN" in action.upper() and domain_opps:
                    top_d = domain_opps[0]
                    cost = top_d.get("cost", 0)
                    self.budget -= cost

                    tx_hash = await record_purchase(
                        item=f"domain:{top_d.get('domain', 'unknown')}",
                        quantity=1,
                        price_per_unit=cost,
                    )

                    await publish({
                        "type": "purchase_executed",
                        "category": "saas",
                        "sub_type": "domain",
                        "agent": self.agent_name,
                        "domain": top_d.get("domain"),
                        "cost": cost,
                        "est_value": top_d.get("est_value"),
                        "roi_pct": top_d.get("roi_pct"),
                        "tx_hash": tx_hash,
                        "remaining_budget": self.budget,
                        "thought": thought,
                        "ts": time.time(),
                    })
                    print(f"[SaaSProcurement] BUY domain: {top_d.get('domain')} @ ${cost}")

                else:
                    print(f"[SaaSProcurement] SKIP: {thought}")

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"[SaaSProcurement] Error: {e}")

    def stop(self):
        self.running = False
