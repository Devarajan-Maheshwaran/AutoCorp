"""
Category 1 Crypto — Sales Agent.
Executes sell-side orders on the richest exchange after a purchase is made.
"""

from __future__ import annotations

import asyncio
import os
import time

from autocorp.core.base_agent import BaseAgent
from autocorp.core.blockchain import record_sale
from autocorp.core.event_bus import publish, subscribe
from autocorp.categories.category1_crypto.tools import CRYPTO_TOOLS, fetch_crypto_prices, calculate_spread


class CryptoSales(BaseAgent):
    """Listens for purchase_executed events and sells on the richer exchange."""

    def __init__(self, charter: dict):
        super().__init__("crypto_sales", charter, CRYPTO_TOOLS)
        self.system_prompt = self.build_system_prompt(
            role_description=(
                "You are a sales agent. When a purchase is executed, find the best "
                "sell price on another exchange and execute the sale to capture the spread. "
                "Consider slippage, fees, and minimum profit thresholds."
            ),
            actions=[
                "CALL_TOOL | tool: fetch_crypto_prices | args: {\"asset\": \"<symbol>\"}",
                "CALL_TOOL | tool: calculate_spread | args: {\"prices\": [...]}",
                "SELL | exchange: <name> | asset: <symbol> | qty: <amount> | price: <price>",
                "HOLD — wait for better price",
            ],
        )
        self.inventory: list[dict] = []
        self.total_profit = 0.0

    async def run_loop(self):
        """Listen for purchase_executed events and sell on the best exchange."""
        self.running = True
        queue = await subscribe("purchase_executed")
        print("[CryptoSales] Listening for purchase events")

        while self.running:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=60)
                if event.get("category") != "crypto":
                    continue

                asset = event.get("asset", "ETH")
                qty = event.get("qty", 0)
                buy_price = event.get("price", 0)
                buy_exchange = event.get("exchange", "?")

                # Get current prices
                prices = await fetch_crypto_prices(asset)
                spread_info = calculate_spread(prices)
                sell_price = spread_info.get("sell_price", 0)
                sell_exchange = spread_info.get("sell_exchange", "?")

                gross_profit = (sell_price - buy_price) * qty
                fees_estimate = (sell_price * qty) * 0.002  # ~0.2% fees
                net_profit = gross_profit - fees_estimate

                observation = (
                    f"Bought {qty:.4f} {asset} @ ${buy_price:.2f} on {buy_exchange}. "
                    f"Best sell: ${sell_price:.2f} on {sell_exchange}. "
                    f"Gross P&L: ${gross_profit:.2f}, est. fees: ${fees_estimate:.2f}, "
                    f"net: ${net_profit:.2f}"
                )

                thought, action = await self.react_step(observation, self.system_prompt)

                if action.upper().startswith("SELL"):
                    revenue = sell_price * qty
                    self.total_profit += net_profit

                    tx_hash = await record_sale(
                        item=f"crypto:{asset}",
                        quantity=qty,
                        price_per_unit=sell_price,
                    )

                    await publish({
                        "type": "sale_executed",
                        "category": "crypto",
                        "agent": self.agent_name,
                        "asset": asset,
                        "exchange": sell_exchange,
                        "qty": qty,
                        "sell_price": sell_price,
                        "buy_price": buy_price,
                        "gross_profit": gross_profit,
                        "net_profit": net_profit,
                        "total_profit": self.total_profit,
                        "tx_hash": tx_hash,
                        "thought": thought,
                        "ts": time.time(),
                    })
                    print(
                        f"[CryptoSales] SELL {qty:.4f} {asset} "
                        f"@ ${sell_price:.2f} on {sell_exchange} | "
                        f"net P&L: ${net_profit:.2f}"
                    )
                else:
                    self.inventory.append({
                        "asset": asset, "qty": qty,
                        "buy_price": buy_price, "ts": time.time(),
                    })
                    print(f"[CryptoSales] HOLD: {thought}")

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"[CryptoSales] Error: {e}")

    def stop(self):
        self.running = False
