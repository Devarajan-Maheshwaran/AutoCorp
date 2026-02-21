"""
Sales Agent — receives delivery confirmations from Logistics (Member 4),
negotiates with mock Mumbai wholesale buyers using live Mumbai mandi prices,
records the sale on Sepolia, and generates a [SIMULATED] Razorpay payment link.

Negotiation loop (triggered by A2A ``delivery_confirmed`` from Logistics):
  1. Compute landed cost = purchase price + transport cost
  2. Fetch live Mumbai wholesale price via MandiFeed
  3. Generate [SIMULATED] buyer offers based on negotiation styles
  4. ReAct loop (up to max_holding_days rounds):
       ACCEPT_OFFER | COUNTER_OFFER | WAIT_BETTER_PRICE | CUT_LOSS_SELL | CALL_TOOL
  5. On sale: recordSale on-chain + create_payment_link + A2A to Accountant & Founder
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from uuid import uuid4
from typing import Any

from member2.shared.a2a import A2AMessage, new_task_id, send_a2a
from member2.shared.blockchain import (
    get_business_contract,
    get_escrow_balance,
    send_tx,
)
from member2.shared.config import (
    ACCOUNTANT_AGENT_URL,
    BUSINESS_ENTITY_ADDRESS,
    CHARTER,
    FOUNDER_AGENT_URL,
    SALES_PRIVATE_KEY,
)
from member2.shared.event_bus import publish
from member2.shared.llm import ReActAgent
from member2.shared.price_feed import MandiFeed

log = logging.getLogger(__name__)

# ── System prompt ──────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are the Sales Agent for AutoCorp. You receive delivery confirmations \
after purchased dal arrives in Mumbai. Your job is to sell the arrived dal \
to Mumbai wholesale buyers at the best price above the minimum margin.

You have access to one tool:
  get_mumbai_dal_price  — fetches live Mumbai wholesale Moong Dal price (₹/kg)

You will be given buyer offers for each lot. Buyers have different \
negotiation styles (aggressive, moderate, flexible) which affect their \
initial offer relative to market price.

Your actions (respond in EXACTLY this format):
Thought: <your analysis of offers, margin, and strategy>
Action: ACCEPT_OFFER | buyer: <buyer_id> | price: <agreed_price> | reason: <why>
   OR
Action: COUNTER_OFFER | buyer: <buyer_id> | counter_price: <your_counter> | reason: <why>
   OR
Action: WAIT_BETTER_PRICE | reason: <why you expect prices to improve>
   OR
Action: CUT_LOSS_SELL | buyer: <buyer_id> | price: <best_available> | reason: <why cutting loss>
   OR
Action: CALL_TOOL | tool: get_mumbai_dal_price | args: {}

Decision framework:
- Min margin target: 15%. Accept offers meeting this threshold.
- For margins 5-15%: accept if holding costs would erode further.
- For margins < 5%: consider counter-offering or waiting (early days).
- On holding day 4-5: CUT_LOSS_SELL at best available — quality degrades.
- Holding cost: ₹2/kg/day. Dal quality degrades after 5 days max.
- Counter-offer strategy: propose midpoint between buyer offer and your target.
- Only WAIT if early in holding window AND market trend is upward.

--- Example 1: Accept immediately (good margin) ---
Observation: Lot LOT-A001, 200kg. Landed cost ₹84/kg. Min sell ₹96.60/kg.
Mumbai market: ₹102/kg. Holding day 1/5.
Buyers: Sharma Wholesale offers ₹99.00/kg (flexible), Patel Traders offers ₹95.50/kg (moderate).
Thought: Sharma offers ₹99/kg vs landed ₹84/kg = 17.9% margin. Exceeds 15% target.
Patel at ₹95.50/kg = 13.7%, below target. Accept Sharma's offer immediately.
Action: ACCEPT_OFFER | buyer: BUY001 | price: 99.00 | reason: 17.9% margin exceeds 15% target

--- Example 2: Counter offer ---
Observation: Lot LOT-B002, 200kg. Landed cost ₹85/kg. Min sell ₹97.75/kg.
Mumbai market: ₹100/kg. Holding day 1/5.
Buyers: Patel Traders offers ₹94.00/kg (moderate), Jain Commodities offers ₹90.00/kg (aggressive).
Thought: Best offer ₹94/kg = 10.6% margin, below 15% target. Market is ₹100/kg.
Patel is moderate style — may accept counter. Midpoint: (94+97.75)/2 = ₹95.88.
Counter at ₹96/kg for 12.9% — still below target but better than accepting ₹94.
Action: COUNTER_OFFER | buyer: BUY002 | counter_price: 96.00 | reason: midpoint counter, 12.9% margin improvement

--- Example 3: Wait for better price ---
Observation: Lot LOT-C003, 200kg. Landed cost ₹80/kg. Min sell ₹92.00/kg.
Mumbai market: ₹88/kg (yesterday was ₹86/kg — trending UP). Holding day 1/5.
Buyers: Mumbai Dal House offers ₹86.00/kg (flexible), Agrawal Exports offers ₹84.00/kg (moderate).
Thought: Best offer ₹86/kg = 7.5% margin, below 15%. But market trending up — \
₹86→₹88 in one day. We have 4 more holding days. Wait for better prices.
Action: WAIT_BETTER_PRICE | reason: market trending up, 4 holding days remain, expect better offers tomorrow

--- Example 4: Cut loss on day 5 ---
Observation: Lot LOT-D004, 200kg. Landed cost ₹82/kg. Min sell ₹94.30/kg.
Mumbai market: ₹83/kg. Holding day 5/5 (FINAL DAY).
Buyers: Patel Traders offers ₹81.00/kg (moderate), Sharma Wholesale offers ₹82.50/kg (flexible).
Thought: Day 5 — MUST sell today or quality degrades completely. Best offer ₹82.50/kg \
vs landed ₹82/kg + ₹8/kg holding (4 days × ₹2) = ₹90/kg effective. Loss of ₹7.50/kg.
But not selling = total loss. Cut loss at ₹82.50/kg.
Action: CUT_LOSS_SELL | buyer: BUY001 | price: 82.50 | reason: day 5 final, must sell to avoid total loss

--- Example 5: Tool call at start ---
Observation: Delivery confirmed. Lot LOT-E005, 200kg Moong Dal arrived Mumbai.
Purchase price ₹76/kg, transport ₹9/kg. Landed cost ₹85/kg.
Thought: I need the current Mumbai wholesale price to evaluate offers.
Action: CALL_TOOL | tool: get_mumbai_dal_price | args: {}\
"""


# ── Mock buyers (allowed mock per spec) ────────────────────────────────────

MOCK_BUYERS: list[dict[str, str]] = [
    {
        "id": "BUY001",
        "name": "Sharma Wholesale",
        "location": "Dadar Vegetable Market, Mumbai",
        "negotiation_style": "flexible",
    },
    {
        "id": "BUY002",
        "name": "Patel Traders",
        "location": "Vashi APMC, Navi Mumbai",
        "negotiation_style": "moderate",
    },
    {
        "id": "BUY003",
        "name": "Mumbai Dal House",
        "location": "Crawford Market, Mumbai",
        "negotiation_style": "flexible",
    },
    {
        "id": "BUY004",
        "name": "Jain Commodities",
        "location": "Navi Mumbai APMC Sector 19",
        "negotiation_style": "aggressive",
    },
    {
        "id": "BUY005",
        "name": "Agrawal Exports",
        "location": "Kurla Market, Mumbai",
        "negotiation_style": "moderate",
    },
]


# ── Agent ──────────────────────────────────────────────────────────────────


class SalesAgent:
    """Negotiates sell price with mock buyers, records sale on-chain."""

    def __init__(self) -> None:
        self.tool_registry: dict[str, Any] = {
            "get_mumbai_dal_price": self._tool_get_mumbai_price,
        }
        self.react = ReActAgent(
            SYSTEM_PROMPT,
            tool_registry=self.tool_registry,
        )
        self._queue: asyncio.Queue = asyncio.Queue()
        self.charter = CHARTER
        self.contract = get_business_contract()
        self.total_revenue: float = 0.0
        self.total_cost: float = 0.0

    # ── MCP tool callables ────────────────────────────────────────────

    async def _tool_get_mumbai_price(self, args: dict) -> dict:  # noqa: ARG002
        try:
            return await MandiFeed.get_latest_price_mumbai("Moong Dal")
        except Exception as exc:
            log.warning("Mumbai price feed failed, using estimate: %s", exc)
            return {
                "modal_price": 95.0,
                "market": "Mumbai (estimate)",
                "commodity": "Moong Dal",
                "arrival_date": "N/A",
                "source": "fallback estimate",
            }

    # ── Buyer offer generation ────────────────────────────────────────

    @staticmethod
    def _generate_buyer_offers(mumbai_price: float) -> list[dict[str, Any]]:
        """
        Generate [SIMULATED] buyer offers sorted by price descending.
        Offer spread depends on negotiation style.
        """
        offers = []
        for buyer in MOCK_BUYERS:
            style = buyer["negotiation_style"]
            if style == "aggressive":
                mult = random.uniform(0.89, 0.92)
            elif style == "moderate":
                mult = random.uniform(0.93, 0.96)
            else:  # flexible
                mult = random.uniform(0.97, 0.99)

            offer_price = round(mumbai_price * mult, 2)
            offers.append({
                "buyer_id": buyer["id"],
                "buyer_name": buyer["name"],
                "location": buyer["location"],
                "negotiation_style": style,
                "offer_price": offer_price,
            })

        offers.sort(key=lambda o: o["offer_price"], reverse=True)
        return offers

    # ── Inbound A2A ──────────────────────────────────────────────────

    async def receive_delivery(self, payload: dict) -> None:
        await self._queue.put(payload)

    # ── Delivery processing (full negotiation loop) ───────────────────

    async def process_delivery(self, delivery: dict) -> None:
        lot_id = delivery["lot_id"]
        qty = delivery.get("quantity_kg", self.charter["max_lot_kg"])
        buy_price = delivery["price_per_kg"]
        transport_cost = delivery.get("transport_cost_per_kg", 9.0)
        cost_per_kg = round(buy_price + transport_cost, 2)
        min_margin = self.charter["min_margin_pct"]
        min_sell = round(cost_per_kg * (1 + min_margin / 100), 2)
        max_hold = self.charter["max_holding_days"]

        # Fresh reasoning context per delivery
        self.react.reset_history()

        await publish({
            "agent": "sales",
            "type": "delivery_received",
            "lot_id": lot_id,
            "qty": qty,
            "buy_price": buy_price,
            "transport_cost": transport_cost,
            "cost_per_kg": cost_per_kg,
            "min_sell": min_sell,
        })

        # Fetch live Mumbai price
        try:
            mumbai_data = await MandiFeed.get_latest_price_mumbai("Moong Dal")
            mumbai_price = mumbai_data["modal_price"]
        except Exception as exc:
            mumbai_price = round(min_sell * 1.1, 2)
            await publish({
                "agent": "sales",
                "type": "warning",
                "message": f"Mumbai price feed failed (using fallback ₹{mumbai_price}/kg): {exc}",
                "lot_id": lot_id,
            })

        # Buyer outreach event (simulated)
        await publish({
            "agent": "sales",
            "type": "buyer_outreach",
            "lot_id": lot_id,
            "buyers_contacted": len(MOCK_BUYERS),
            "mumbai_market_price": mumbai_price,
            "simulated": True,
        })

        # ── Negotiation loop ──────────────────────────────────────────
        sale_done = False
        sell_price = 0.0
        final_buyer: dict[str, Any] = {}
        holding_days_used = 0

        for day in range(1, max_hold + 1):
            holding_days_used = day

            # Generate fresh offers each round
            offers = self._generate_buyer_offers(mumbai_price)
            best = offers[0]

            await publish({
                "agent": "sales",
                "type": "market_check",
                "lot_id": lot_id,
                "holding_day": day,
                "mumbai_price": mumbai_price,
                "best_offer": best["offer_price"],
                "best_buyer": best["buyer_name"],
                "num_offers": len(offers),
            })

            offers_str = ", ".join(
                f"{o['buyer_name']} offers ₹{o['offer_price']}/kg ({o['negotiation_style']})"
                for o in offers[:3]
            )
            observation = (
                f"Lot {lot_id}, {qty}kg. Landed cost ₹{cost_per_kg}/kg. "
                f"Min sell ₹{min_sell}/kg.\n"
                f"Mumbai market: ₹{mumbai_price}/kg. Holding day {day}/{max_hold}.\n"
                f"Buyers: {offers_str}."
            )

            thought, action, raw = await self.react.step(observation)

            await publish({
                "agent": "sales",
                "type": "react_step",
                "thought": thought,
                "action": action,
                "raw": raw,
                "lot_id": lot_id,
                "holding_day": day,
            })

            # ── Handle action ────────────────────────────────────────
            if action.startswith("ACCEPT_OFFER"):
                sell_price = self._parse_price(action, best["offer_price"])
                final_buyer = self._find_buyer(action, offers)
                sale_done = True
                break

            elif action.startswith("COUNTER_OFFER"):
                counter_price = self._parse_counter(action)
                target_buyer = self._find_buyer(action, offers)

                # Style-based acceptance logic
                style = target_buyer.get("negotiation_style", "moderate")
                if style == "flexible":
                    accept_prob = 0.7
                elif style == "moderate":
                    accept_prob = 0.5
                else:  # aggressive
                    accept_prob = 0.3

                accepted = random.random() < accept_prob

                await publish({
                    "agent": "sales",
                    "type": "counter_offer",
                    "lot_id": lot_id,
                    "buyer": target_buyer.get("buyer_name", "Unknown"),
                    "counter_price": counter_price,
                    "accepted": accepted,
                    "simulated": True,
                })

                if accepted:
                    sell_price = counter_price
                    final_buyer = target_buyer
                    sale_done = True
                    break

            elif action.startswith("WAIT_BETTER_PRICE"):
                await asyncio.sleep(2)  # simulate waiting
                # Refresh Mumbai price for next round
                try:
                    mumbai_data = await MandiFeed.get_latest_price_mumbai("Moong Dal")
                    mumbai_price = mumbai_data["modal_price"]
                except Exception:
                    pass  # keep previous price

            elif action.startswith("CUT_LOSS_SELL"):
                sell_price = self._parse_price(action, best["offer_price"])
                final_buyer = self._find_buyer(action, offers)
                sale_done = True
                break

        # ── Force sell if loop ended without sale ─────────────────────
        if not sale_done:
            offers = self._generate_buyer_offers(mumbai_price)
            best = offers[0]
            sell_price = best["offer_price"]
            final_buyer = best
            holding_days_used = max_hold

        # ── Execute sale ──────────────────────────────────────────────
        await self._execute_sale(
            lot_id=lot_id,
            qty=qty,
            buy_price=buy_price,
            transport_cost=transport_cost,
            cost_per_kg=cost_per_kg,
            sell_price=sell_price,
            buyer=final_buyer,
            holding_days_used=holding_days_used,
        )

    # ── Parse helpers ─────────────────────────────────────────────────

    @staticmethod
    def _parse_price(action: str, fallback: float) -> float:
        """Extract 'price: <float>' from action string."""
        for part in action.split("|"):
            part = part.strip()
            if part.startswith("price:"):
                try:
                    return float(part.split(":", 1)[1].strip())
                except ValueError:
                    return fallback
        return fallback

    @staticmethod
    def _parse_counter(action: str) -> float:
        """Extract 'counter_price: <float>' from action string."""
        for part in action.split("|"):
            part = part.strip()
            if part.startswith("counter_price:"):
                try:
                    return float(part.split(":", 1)[1].strip())
                except ValueError:
                    return 0.0
        return 0.0

    @staticmethod
    def _find_buyer(action: str, offers: list[dict]) -> dict:
        """Extract buyer_id from action and find matching offer."""
        for part in action.split("|"):
            part = part.strip()
            if part.startswith("buyer:"):
                buyer_id = part.split(":", 1)[1].strip()
                for o in offers:
                    if o["buyer_id"] == buyer_id:
                        return o
        return offers[0] if offers else {}

    # ── Sale execution (on-chain + payment + A2A) ─────────────────────

    async def _execute_sale(
        self,
        *,
        lot_id: str,
        qty: int,
        buy_price: float,
        transport_cost: float,
        cost_per_kg: float,
        sell_price: float,
        buyer: dict,
        holding_days_used: int,
    ) -> None:
        revenue = round(sell_price * qty, 2)
        total_landed = round(cost_per_kg * qty, 2)
        gross_profit = round(revenue - total_landed, 2)
        margin_pct = round(
            (sell_price - cost_per_kg) / cost_per_kg * 100, 2
        ) if cost_per_kg else 0.0

        buyer_id = buyer.get("buyer_id", f"MBY-{uuid4().hex[:8].upper()}")
        buyer_name = buyer.get("buyer_name", "Unknown Buyer")
        tx_hash = ""

        # ── On-chain recordSale ───────────────────────────────────────
        if self.contract is not None and SALES_PRIVATE_KEY:
            try:
                tx_hash = send_tx(
                    self.contract.functions.recordSale(
                        qty, int(sell_price * 100), buyer_id
                    ),
                    SALES_PRIVATE_KEY,
                )
                await publish({
                    "agent": "sales",
                    "type": "onchain_event",
                    "event": "SaleRecorded",
                    "tx_hash": tx_hash,
                    "etherscan": f"https://sepolia.etherscan.io/tx/{tx_hash}",
                    "qty": qty,
                    "sell_price_per_kg": sell_price,
                    "lot_id": lot_id,
                    "buyer_id": buyer_id,
                })
            except Exception as exc:
                log.exception("On-chain recordSale failed")
                await publish({
                    "agent": "sales",
                    "type": "error",
                    "message": f"on-chain recordSale failed: {exc}",
                    "lot_id": lot_id,
                })
        else:
            await publish({
                "agent": "sales",
                "type": "warning",
                "message": "on-chain recordSale skipped — contract not configured",
                "lot_id": lot_id,
            })

        self.total_revenue += revenue
        self.total_cost += total_landed

        # ── Payment link (simulated) ──────────────────────────────────
        short_id = uuid4().hex[:8].upper()
        payment_url = f"https://rzp.io/l/AUTOCORP-{short_id}"

        await publish({
            "agent": "sales",
            "type": "payment_link",
            "lot_id": lot_id,
            "url": payment_url,
            "amount_inr": revenue,
            "buyer_id": buyer_id,
            "buyer_name": buyer_name,
            "simulated": True,
        })

        # ── Sale completed event ──────────────────────────────────────
        sale_result = {
            "agent": "sales",
            "type": "sale_completed",
            "lot_id": lot_id,
            "buyer_id": buyer_id,
            "buyer_name": buyer_name,
            "qty": qty,
            "sell_price_per_kg": sell_price,
            "total_revenue": revenue,
            "cost_per_kg": cost_per_kg,
            "total_landed_cost": total_landed,
            "gross_profit": gross_profit,
            "margin_pct": margin_pct,
            "holding_days_used": holding_days_used,
            "tx_hash": tx_hash or None,
            "payment_url": payment_url,
        }
        await publish(sale_result)

        # ── A2A → Accountant ──────────────────────────────────────────
        report_payload = {
            "lot_id": lot_id,
            "quantity_kg": qty,
            "sell_price_per_kg": sell_price,
            "gross_profit": gross_profit,
            "margin_pct": margin_pct,
            "buyer_id": buyer_id,
            "buyer_name": buyer_name,
            "holding_days_used": holding_days_used,
            "tx_hash": tx_hash,
        }

        for target_name, target_url in [
            ("accountant", ACCOUNTANT_AGENT_URL),
            ("founder", FOUNDER_AGENT_URL),
        ]:
            msg = A2AMessage(
                task_id=new_task_id(),
                from_agent="sales",
                to_agent=target_name,
                capability="sale_report",
                payload=report_payload,
            )
            try:
                await send_a2a(target_url, msg)
                await publish({
                    "agent": "sales",
                    "type": "a2a_sent",
                    "to": target_name,
                    "capability": "sale_report",
                    "lot_id": lot_id,
                    "gross_profit": gross_profit,
                })
            except Exception as exc:
                log.warning("A2A to %s failed: %s", target_name, exc)
                await publish({
                    "agent": "sales",
                    "type": "error",
                    "message": f"A2A to {target_name} failed: {exc}",
                    "lot_id": lot_id,
                })

    # ── Main loop ─────────────────────────────────────────────────────

    async def run(self) -> None:
        await publish({
            "agent": "sales",
            "type": "status",
            "status": "running",
        })

        while True:
            signal = await self._queue.get()
            asyncio.create_task(self.process_delivery(signal))
