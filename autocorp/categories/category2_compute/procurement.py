"""
Category 2 Compute — Procurement Agent.
Procures cheap GPU instances or bulk API credits when spreads are viable.
"""

from __future__ import annotations

import asyncio
import time

from autocorp.core.base_agent import BaseAgent
from autocorp.core.blockchain import record_purchase
from autocorp.core.event_bus import publish, subscribe
from autocorp.categories.category2_compute.tools import COMPUTE_TOOLS, fetch_gpu_spot_prices


class ComputeProcurement(BaseAgent):
    """Listens for compute spread events and executes buy-side orders."""

    def __init__(self, charter: dict):
        super().__init__("compute_procurement", charter, COMPUTE_TOOLS)
        self.system_prompt = self.build_system_prompt(
            role_description=(
                "You are a compute procurement agent. When a spread opportunity arrives, "
                "decide whether to reserve GPU instances or buy bulk API credits at the "
                "cheaper provider. Factor in commitment periods, cancellation risk, and "
                "utilisation rates from the charter."
            ),
            actions=[
                "CALL_TOOL | tool: fetch_gpu_spot_prices | args: {\"gpu_type\": \"A100\"}",
                "BUY_GPU | provider: <name> | gpu: <type> | hours: <n> | price_hr: <price>",
                "BUY_CREDITS | platform: <name> | quantity_1k: <n> | price_per_1k: <price>",
                "SKIP — not worth executing",
            ],
        )
        self.budget = charter.get("parameters", {}).get("budget_usd", 5000)
        self.max_trade_pct = charter.get("parameters", {}).get("max_single_trade_pct", 25) / 100

    async def run_loop(self):
        self.running = True
        queue = await subscribe("price_spread")
        print(f"[ComputeProcurement] Listening, budget=${self.budget}")

        while self.running:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=60)
                if event.get("category") != "compute":
                    continue

                spread = event.get("spread", {})
                gpu_type = event.get("gpu_type", "A100")
                buy_price = spread.get("buy_price_hr", 0)
                spread_pct = spread.get("spread_pct", 0)

                max_spend = self.budget * self.max_trade_pct
                hours = int(max_spend / buy_price) if buy_price > 0 else 0
                cost = buy_price * hours

                observation = (
                    f"Compute spread: {spread_pct}% on {gpu_type}. "
                    f"Buy at {spread.get('buy_provider', '?')} for ${buy_price:.2f}/hr. "
                    f"Budget: ${self.budget:.2f}, can reserve {hours}h (${cost:.2f}). "
                    f"Credit opportunities: {len(event.get('credit_opportunities', []))}"
                )

                thought, action = await self.react_step(observation, self.system_prompt)

                if "BUY_GPU" in action.upper() or "BUY_CREDITS" in action.upper():
                    self.budget -= cost

                    tx_hash = await record_purchase(
                        item=f"compute:{gpu_type}",
                        quantity=hours,
                        price_per_unit=buy_price,
                    )

                    await publish({
                        "type": "purchase_executed",
                        "category": "compute",
                        "agent": self.agent_name,
                        "gpu_type": gpu_type,
                        "provider": spread.get("buy_provider"),
                        "hours": hours,
                        "price_hr": buy_price,
                        "cost": cost,
                        "tx_hash": tx_hash,
                        "remaining_budget": self.budget,
                        "thought": thought,
                        "ts": time.time(),
                    })
                    print(f"[ComputeProcurement] BUY {hours}h {gpu_type} @ ${buy_price:.2f}/hr")
                else:
                    print(f"[ComputeProcurement] SKIP: {thought}")

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"[ComputeProcurement] Error: {e}")

    def stop(self):
        self.running = False
