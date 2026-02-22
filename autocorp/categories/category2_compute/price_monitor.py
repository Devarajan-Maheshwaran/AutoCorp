"""
Category 2 Compute — Price Monitor Agent.
Watches GPU spot prices and API credit rates across providers.
"""

from __future__ import annotations

import asyncio
import os
import time

from autocorp.core.base_agent import BaseAgent
from autocorp.core.event_bus import publish
from autocorp.categories.category2_compute.tools import (
    COMPUTE_TOOLS,
    fetch_gpu_spot_prices,
    fetch_api_credit_prices,
    calculate_compute_spread,
    calculate_credit_arbitrage,
)


POLL_INTERVAL = int(os.getenv("PRICE_POLL_INTERVAL", "30"))


class ComputePriceMonitor(BaseAgent):
    """Monitors GPU spot prices and API credit rates for compute arbitrage."""

    def __init__(self, charter: dict):
        super().__init__("compute_price_monitor", charter, COMPUTE_TOOLS)
        self.system_prompt = self.build_system_prompt(
            role_description=(
                "You monitor GPU spot prices and AI API credit rates across providers. "
                "Identify opportunities where compute can be procured cheaply and resold "
                "or utilised at a higher rate."
            ),
            actions=[
                "CALL_TOOL | tool: fetch_gpu_spot_prices | args: {\"gpu_type\": \"A100\"}",
                "CALL_TOOL | tool: fetch_api_credit_prices | args: {}",
                "CALL_TOOL | tool: calculate_compute_spread | args: {\"prices\": [...]}",
                "PUBLISH_SPREAD | spread data",
                "WAIT — no spread worth reporting",
            ],
        )

    async def run_loop(self):
        self.running = True
        gpu_type = self.charter.get("parameters", {}).get("gpu_type", "A100")
        min_spread = self.charter.get("parameters", {}).get("min_spread_pct", 5.0)

        print(f"[ComputePriceMonitor] Starting for gpu={gpu_type}, min_spread={min_spread}%")

        while self.running:
            try:
                # Check GPU spot prices
                gpu_prices = await fetch_gpu_spot_prices(gpu_type)
                spread_info = calculate_compute_spread(gpu_prices)

                # Check API credit arbitrage
                credits = await fetch_api_credit_prices()
                credit_opps = calculate_credit_arbitrage(credits)

                observation = (
                    f"GPU spot: {len(gpu_prices)} providers for {gpu_type}. "
                    f"Best spread: {spread_info.get('spread_pct', 0)}% "
                    f"(buy @ {spread_info.get('buy_provider', '?')} "
                    f"${spread_info.get('buy_price_hr', 0):.2f}/hr, "
                    f"sell @ {spread_info.get('sell_provider', '?')} "
                    f"${spread_info.get('sell_price_hr', 0):.2f}/hr). "
                    f"API credits: {len(credit_opps)} opportunities."
                )

                thought, action = await self.react_step(observation, self.system_prompt)

                # Publish GPU spread if viable
                if spread_info.get("spread_pct", 0) >= min_spread or "PUBLISH_SPREAD" in action:
                    await publish({
                        "type": "price_spread",
                        "category": "compute",
                        "agent": self.agent_name,
                        "gpu_type": gpu_type,
                        "spread": spread_info,
                        "credit_opportunities": credit_opps[:3],
                        "thought": thought,
                        "ts": time.time(),
                    })
                    print(f"[ComputePriceMonitor] Published spread: {spread_info.get('spread_pct', 0)}%")

            except Exception as e:
                print(f"[ComputePriceMonitor] Error: {e}")

            await asyncio.sleep(POLL_INTERVAL)

    def stop(self):
        self.running = False
