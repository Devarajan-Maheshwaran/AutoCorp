"""
Category 5 SaaS — Sales Agent.
Resells SaaS licences at retail or flips domains.
"""

from __future__ import annotations

import asyncio
import time

from autocorp.core.base_agent import BaseAgent
from autocorp.core.blockchain import record_sale
from autocorp.core.event_bus import publish, subscribe
from autocorp.categories.category5_saas.tools import SAAS_TOOLS


class SaaSSales(BaseAgent):
    """Listens for SaaS purchases and resells licences/domains at retail."""

    def __init__(self, charter: dict):
        super().__init__("saas_sales", charter, SAAS_TOOLS)
        self.system_prompt = self.build_system_prompt(
            role_description=(
                "You are a SaaS sales agent. After licences or domains are procured, "
                "find buyers and execute the resale. For licences, list on marketplaces "
                "at retail price. For domains, list on aftermarket platforms."
            ),
            actions=[
                "SELL_LICENCE | product: <name> | seats: <n> | price_per_seat: <price>",
                "SELL_DOMAIN | domain: <name> | asking_price: <price>",
                "HOLD — wait for better pricing or buyer",
            ],
        )
        self.total_profit = 0.0

    async def run_loop(self):
        self.running = True
        queue = await subscribe("purchase_executed")
        print("[SaaSSales] Listening for purchase events")

        while self.running:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=60)
                if event.get("category") != "saas":
                    continue

                sub_type = event.get("sub_type", "licence")

                if sub_type == "licence":
                    product = event.get("product", "?")
                    seats = event.get("seats", 0)
                    buy_price = event.get("price_per_seat", 0)
                    retail = event.get("retail_price", 0)
                    cost = event.get("cost", 0)

                    revenue = retail * seats
                    gross_profit = revenue - cost
                    fees = revenue * 0.10  # 10% marketplace fee
                    net_profit = gross_profit - fees

                    observation = (
                        f"Bought {seats} seats of {product} @ ${buy_price:.2f}/seat "
                        f"(total ${cost:.2f}). Retail: ${retail:.2f}/seat. "
                        f"Revenue if sold: ${revenue:.2f}, net profit: ${net_profit:.2f}"
                    )

                elif sub_type == "domain":
                    domain = event.get("domain", "?")
                    cost = event.get("cost", 0)
                    est_value = event.get("est_value", 0)
                    net_profit = est_value - cost - (est_value * 0.15)  # 15% broker fee

                    observation = (
                        f"Bought domain {domain} for ${cost}. "
                        f"Estimated value: ${est_value}. "
                        f"Net profit after 15% fee: ${net_profit:.2f}"
                    )
                else:
                    continue

                thought, action = await self.react_step(observation, self.system_prompt)

                if "SELL" in action.upper():
                    self.total_profit += net_profit

                    item_name = (
                        f"saas:{event.get('product', 'unknown')}"
                        if sub_type == "licence"
                        else f"domain:{event.get('domain', 'unknown')}"
                    )
                    sell_qty = event.get("seats", 1)
                    sell_price = event.get("retail_price", est_value if sub_type == "domain" else 0)

                    tx_hash = await record_sale(
                        item=item_name,
                        quantity=sell_qty,
                        price_per_unit=sell_price,
                    )

                    await publish({
                        "type": "sale_executed",
                        "category": "saas",
                        "sub_type": sub_type,
                        "agent": self.agent_name,
                        "item": item_name,
                        "net_profit": net_profit,
                        "total_profit": self.total_profit,
                        "tx_hash": tx_hash,
                        "thought": thought,
                        "ts": time.time(),
                    })
                    print(f"[SaaSSales] SELL {item_name} | net: ${net_profit:.2f}")
                else:
                    print(f"[SaaSSales] HOLD: {thought}")

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"[SaaSSales] Error: {e}")

    def stop(self):
        self.running = False
