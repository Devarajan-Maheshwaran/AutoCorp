"""
Category 1 Crypto — Procurement Agent.
Executes buy-side orders on the cheapest exchange when a viable spread is detected.
"""

from __future__ import annotations

import asyncio
import os
import time

from autocorp.core.base_agent import BaseAgent
from autocorp.core.blockchain import record_purchase
from autocorp.core.event_bus import publish, subscribe
from autocorp.categories.category1_crypto.tools import CRYPTO_TOOLS, fetch_crypto_prices


class CryptoProcurement(BaseAgent):
    """Listens for crypto spread events and executes buy-side orders."""

    def __init__(self, charter: dict):
        super().__init__("crypto_procurement", charter, CRYPTO_TOOLS)
        self.system_prompt = self.build_system_prompt(
            role_description=(
                "You are a procurement agent. When you receive a spread opportunity, "
                "decide whether to BUY on the cheap exchange. Consider trading fees, "
                "slippage, position sizing, and risk limits from the charter."
            ),
            actions=[
                "CALL_TOOL | tool: fetch_crypto_prices | args: {\"asset\": \"<symbol>\"}",
                "BUY | exchange: <name> | asset: <symbol> | qty: <amount> | price: <price>",
                "SKIP — not worth executing (explain why)",
            ],
        )
        self.budget = charter.get("parameters", {}).get("budget_usd", 10000)
        self.max_trade_pct = charter.get("parameters", {}).get("max_single_trade_pct", 20) / 100

    async def run_loop(self):
        """Listen for price_spread events and decide whether to buy."""
        self.running = True
        queue = await subscribe("price_spread")
        print(f"[CryptoProcurement] Listening for spread events, budget=${self.budget}")

        while self.running:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=60)
                if event.get("category") != "crypto":
                    continue

                spread = event.get("spread", {})
                asset = event.get("asset", "ETH")
                buy_price = spread.get("buy_price", 0)
                spread_pct = spread.get("spread_pct", 0)

                max_spend = self.budget * self.max_trade_pct
                qty = max_spend / buy_price if buy_price > 0 else 0

                observation = (
                    f"Spread alert: {spread_pct}% on {asset}. "
                    f"Buy at {spread.get('buy_exchange', '?')} for ${buy_price:.2f}. "
                    f"Budget: ${self.budget:.2f}, max per trade: ${max_spend:.2f}, "
                    f"potential qty: {qty:.4f}"
                )

                thought, action = await self.react_step(observation, self.system_prompt)

                if action.upper().startswith("BUY"):
                    cost = buy_price * qty
                    self.budget -= cost

                    tx_hash = await record_purchase(
                        item=f"crypto:{asset}",
                        quantity=qty,
                        price_per_unit=buy_price,
                    )

                    await publish({
                        "type": "purchase_executed",
                        "category": "crypto",
                        "agent": self.agent_name,
                        "asset": asset,
                        "exchange": spread.get("buy_exchange"),
                        "qty": qty,
                        "price": buy_price,
                        "cost": cost,
                        "tx_hash": tx_hash,
                        "remaining_budget": self.budget,
                        "thought": thought,
                        "ts": time.time(),
                    })
                    print(
                        f"[CryptoProcurement] BUY {qty:.4f} {asset} "
                        f"@ ${buy_price:.2f} on {spread.get('buy_exchange')}"
                    )
                else:
                    print(f"[CryptoProcurement] SKIP: {thought}")

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"[CryptoProcurement] Error: {e}")

    def stop(self):
        self.running = False
