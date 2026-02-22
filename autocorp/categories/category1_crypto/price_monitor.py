"""
Category 1 Crypto — Price Monitor Agent.
Watches exchange prices and publishes spread opportunities.
"""

from __future__ import annotations

import asyncio
import os
import time

from autocorp.core.base_agent import BaseAgent
from autocorp.core.event_bus import publish
from autocorp.categories.category1_crypto.tools import CRYPTO_TOOLS, fetch_crypto_prices, calculate_spread


POLL_INTERVAL = int(os.getenv("PRICE_POLL_INTERVAL", "30"))


class CryptoPriceMonitor(BaseAgent):
    """Monitors crypto exchange prices, finds cross-exchange and funding-rate spreads."""

    def __init__(self, charter: dict):
        super().__init__("crypto_price_monitor", charter, CRYPTO_TOOLS)
        self.system_prompt = self.build_system_prompt(
            role_description="You monitor cryptocurrency prices across exchanges and identify arbitrage spreads.",
            actions=[
                "CALL_TOOL | tool: fetch_crypto_prices | args: {\"asset\": \"<symbol>\"}",
                "CALL_TOOL | tool: fetch_funding_rates | args: {\"asset\": \"<symbol>\"}",
                "CALL_TOOL | tool: calculate_spread | args: {\"prices\": [...]}",
                "PUBLISH_SPREAD | spread data",
                "WAIT — no action needed right now",
            ],
        )

    async def run_loop(self):
        """Main monitoring loop."""
        self.running = True
        asset = self.charter.get("asset", self.charter.get("parameters", {}).get("asset", "ETH"))
        min_spread = self.charter.get("parameters", {}).get("min_spread_pct", 0.1)

        print(f"[CryptoPriceMonitor] Starting for asset={asset}, min_spread={min_spread}%")

        while self.running:
            try:
                prices = await fetch_crypto_prices(asset)
                if not prices:
                    await asyncio.sleep(POLL_INTERVAL)
                    continue

                spread_info = calculate_spread(prices)
                observation = (
                    f"Fetched {len(prices)} exchange prices for {asset}. "
                    f"Best spread: {spread_info['spread_pct']}% "
                    f"(buy @ {spread_info.get('buy_exchange', '?')} "
                    f"${spread_info.get('buy_price', 0):.2f}, "
                    f"sell @ {spread_info.get('sell_exchange', '?')} "
                    f"${spread_info.get('sell_price', 0):.2f})"
                )

                thought, action = await self.react_step(observation, self.system_prompt)

                if spread_info["spread_pct"] >= min_spread or "PUBLISH_SPREAD" in action:
                    await publish({
                        "type": "price_spread",
                        "category": "crypto",
                        "agent": self.agent_name,
                        "asset": asset,
                        "spread": spread_info,
                        "thought": thought,
                        "prices": prices[:5],
                        "ts": time.time(),
                    })
                    print(
                        f"[CryptoPriceMonitor] Published spread: "
                        f"{spread_info['spread_pct']}% for {asset}"
                    )

            except Exception as e:
                print(f"[CryptoPriceMonitor] Error: {e}")

            await asyncio.sleep(POLL_INTERVAL)

    def stop(self):
        self.running = False
