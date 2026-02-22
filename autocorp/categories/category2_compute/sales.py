"""
Category 2 Compute — Sales Agent.
Resells reserved GPU hours or API credits at higher rates.
"""

from __future__ import annotations

import asyncio
import time

from autocorp.core.base_agent import BaseAgent
from autocorp.core.blockchain import record_sale
from autocorp.core.event_bus import publish, subscribe
from autocorp.categories.category2_compute.tools import COMPUTE_TOOLS, fetch_gpu_spot_prices


class ComputeSales(BaseAgent):
    """Listens for compute purchases and sells/subleases at higher rates."""

    def __init__(self, charter: dict):
        super().__init__("compute_sales", charter, COMPUTE_TOOLS)
        self.system_prompt = self.build_system_prompt(
            role_description=(
                "You are a compute sales agent. After GPU hours or credits are procured, "
                "find buyers or list them for resale at the higher-priced provider. "
                "Consider utilisation risk, time decay on reserved instances, and market "
                "demand for the GPU type."
            ),
            actions=[
                "CALL_TOOL | tool: fetch_gpu_spot_prices | args: {\"gpu_type\": \"A100\"}",
                "SELL_GPU | provider: <name> | gpu: <type> | hours: <n> | price_hr: <price>",
                "SELL_CREDITS | platform: <name> | quantity_1k: <n> | price_per_1k: <price>",
                "HOLD — wait for better price or more demand",
            ],
        )
        self.total_profit = 0.0

    async def run_loop(self):
        self.running = True
        queue = await subscribe("purchase_executed")
        print("[ComputeSales] Listening for purchase events")

        while self.running:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=60)
                if event.get("category") != "compute":
                    continue

                gpu_type = event.get("gpu_type", "A100")
                hours = event.get("hours", 0)
                buy_price = event.get("price_hr", 0)
                buy_provider = event.get("provider", "?")

                # Get current market for sell pricing
                prices = await fetch_gpu_spot_prices(gpu_type)
                # Find highest bidder (excluding our buy provider)
                sell_candidates = [p for p in prices if p["provider"] != buy_provider]
                if sell_candidates:
                    best_sell = max(sell_candidates, key=lambda p: p.get("price_hr", 0))
                    sell_price = best_sell["price_hr"]
                    sell_provider = best_sell["provider"]
                else:
                    sell_price = buy_price * 1.1
                    sell_provider = "marketplace"

                gross_profit = (sell_price - buy_price) * hours
                fees = gross_profit * 0.05  # 5% platform fee
                net_profit = gross_profit - fees

                observation = (
                    f"Bought {hours}h {gpu_type} @ ${buy_price:.2f}/hr on {buy_provider}. "
                    f"Best sell: ${sell_price:.2f}/hr on {sell_provider}. "
                    f"Gross: ${gross_profit:.2f}, fees: ${fees:.2f}, net: ${net_profit:.2f}"
                )

                thought, action = await self.react_step(observation, self.system_prompt)

                if "SELL" in action.upper():
                    self.total_profit += net_profit

                    tx_hash = await record_sale(
                        item=f"compute:{gpu_type}",
                        quantity=hours,
                        price_per_unit=sell_price,
                    )

                    await publish({
                        "type": "sale_executed",
                        "category": "compute",
                        "agent": self.agent_name,
                        "gpu_type": gpu_type,
                        "provider": sell_provider,
                        "hours": hours,
                        "sell_price": sell_price,
                        "buy_price": buy_price,
                        "net_profit": net_profit,
                        "total_profit": self.total_profit,
                        "tx_hash": tx_hash,
                        "thought": thought,
                        "ts": time.time(),
                    })
                    print(f"[ComputeSales] SELL {hours}h {gpu_type} @ ${sell_price:.2f}/hr | net: ${net_profit:.2f}")
                else:
                    print(f"[ComputeSales] HOLD: {thought}")

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"[ComputeSales] Error: {e}")

    def stop(self):
        self.running = False
