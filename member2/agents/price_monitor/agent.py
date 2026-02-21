"""
Price Monitor Agent — watches Jodhpur mandi Moong Dal prices and triggers
buy signals for the Procurement Agent via A2A.

Reasoning loop:
  1. Fetch live price via MandiFeed (data.gov.in Agmarknet API)
  2. Feed price + trend to Gemini ReAct engine
  3. LLM may CALL_TOOL mid-thought for fresher data
  4. Final action: TRIGGER_BUY | WAIT | SKIP_ANOMALY
  5. On TRIGGER_BUY → log on-chain (Sepolia) + fire A2A to Procurement
"""

from __future__ import annotations

import asyncio
import logging
from uuid import uuid4

from member2.shared.a2a import A2AMessage, new_task_id, send_a2a
from member2.shared.blockchain import get_business_contract, send_tx
from member2.shared.config import (
    CHARTER,
    PRICE_MONITOR_PRIVATE_KEY,
    PROCUREMENT_AGENT_URL,
)
from member2.shared.event_bus import publish
from member2.shared.llm import ReActAgent
from member2.shared.price_feed import MandiFeed

log = logging.getLogger(__name__)

# ── System prompt ──────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are the Price Monitor Agent for AutoCorp, an autonomous dal commodity \
arbitrage system that invests idle savings into Jodhpur→Mumbai Moong Dal \
arbitrage. Your only role: analyze Jodhpur mandi prices and decide whether \
to trigger a buy signal for the Procurement Agent.

You have access to one tool:
  get_jodhpur_dal_price — fetches live modal price from Agmarknet/data.gov.in

You must reason about three things:
1. Is current price at or below charter threshold?
2. Is this a genuine dip or a data anomaly?
   Flash crash = single-tick drop > 10%. Real market moves are gradual.
3. Is the 7-day trend declining (confirms genuine dip) or noisy?

Always respond in EXACTLY this format — no deviations:
Thought: <your analysis>
Action: TRIGGER_BUY | reason: <why>
   OR
Action: WAIT | reason: <why>
   OR
Action: SKIP_ANOMALY | reason: <why>
   OR
Action: CALL_TOOL | tool: get_jodhpur_dal_price | args: {}

--- Example 1: Normal trigger ---
Observation: Price ₹78/kg. Threshold ₹80/kg. Prev ₹79/kg (change -1.3%).
7-day avg ₹83.4/kg. Trend: declining 4 consecutive days.
Thought: ₹78 is below threshold ₹80. The -1.3% tick change is normal market \
movement, not an anomaly. 7-day average ₹83.4 confirms this is a genuine \
harvest-season dip, not noise. Four days of consecutive decline confirms \
sustained low — not a temporary spike downward.
Action: TRIGGER_BUY | reason: price ₹78 below ₹80 threshold, stable -1.3% tick, confirmed by ₹83.4 avg

--- Example 2: Flash crash skip ---
Observation: Price ₹69/kg. Threshold ₹80/kg. Prev ₹85/kg (change -18.8%).
7-day avg ₹84.1/kg.
Thought: An 18.8% single-tick crash from ₹85 to ₹69 is not a real market move. \
Agmarknet feeds sometimes push erroneous quotes when mandi data entry has errors. \
Buying at ₹69 when true market is ₹85 would result in purchase rejection at mandi. \
The 7-day avg ₹84.1 also confirms ₹69 is an outlier.
Action: SKIP_ANOMALY | reason: 18.8% single-tick drop exceeds 10% flash-crash threshold, avg confirms outlier

--- Example 3: Above threshold, wait ---
Observation: Price ₹82/kg. Threshold ₹80/kg. Prev ₹83/kg (change -1.2%).
7-day avg ₹84.6/kg.
Thought: Price ₹82 is above threshold ₹80. Trend is slowly declining — promising \
but not actionable yet. Continuing to monitor.
Action: WAIT | reason: ₹82 above threshold ₹80, trend declining but not triggered yet

--- Example 4: Tool call mid-reasoning ---
Observation: Starting new monitoring cycle. No price data yet.
Thought: I need the current Jodhpur mandi price before I can make any decision.
Action: CALL_TOOL | tool: get_jodhpur_dal_price | args: {}
"""


# ── Agent ──────────────────────────────────────────────────────────────────


class PriceMonitorAgent:
    """Continuously polls Jodhpur mandi prices and triggers buy signals."""

    def __init__(self) -> None:
        self.tool_registry = {
            "get_jodhpur_dal_price": self._tool_get_price,
        }
        self.react = ReActAgent(
            SYSTEM_PROMPT,
            tool_registry=self.tool_registry,
        )
        self.price_window: list[float] = []  # rolling last 7 prices
        self.charter = CHARTER
        self.contract = get_business_contract()
        self._triggered_this_cycle = False

    # ── MCP tool callable ─────────────────────────────────────────────

    async def _tool_get_price(self, args: dict) -> dict:  # noqa: ARG002
        return await MandiFeed.get_latest_price("Jodhpur", "Moong Dal")

    # ── Helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _trend_days(window: list[float]) -> int:
        """Count consecutive declining days at the tail of *window*."""
        days = 0
        for i in range(len(window) - 1, 0, -1):
            if window[i] < window[i - 1]:
                days += 1
            else:
                break
        return days

    # ── Main loop ─────────────────────────────────────────────────────

    async def run(self) -> None:
        await publish({"agent": "price_monitor", "type": "status", "status": "running"})

        while True:
            try:
                # 1 — Fetch live price
                result = await MandiFeed.get_latest_price("Jodhpur", "Moong Dal")
                modal_price = result["modal_price"]
                arrival_date = result["arrival_date"]

                # 2 — Update rolling window
                self.price_window.append(modal_price)
                if len(self.price_window) > 7:
                    self.price_window = self.price_window[-7:]

                # 3 — Compute analytics
                prev_price = (
                    self.price_window[-2]
                    if len(self.price_window) >= 2
                    else modal_price
                )
                pct_change = round(
                    (modal_price - prev_price) / prev_price * 100, 2
                ) if prev_price else 0.0
                avg7 = round(
                    sum(self.price_window) / len(self.price_window), 2
                )
                threshold = self.charter["price_threshold_buy"]
                trend_days = self._trend_days(self.price_window)

                # 4 — Publish price tick
                await publish({
                    "agent": "price_monitor",
                    "type": "price_tick",
                    "price": modal_price,
                    "prev": prev_price,
                    "pct_change": pct_change,
                    "avg7": avg7,
                    "threshold": threshold,
                    "arrival_date": arrival_date,
                    "trend_days": trend_days,
                })

                # 5 — Build observation for LLM
                observation = (
                    f"Price ₹{modal_price}/kg. "
                    f"Threshold ₹{threshold}/kg. "
                    f"Prev ₹{prev_price}/kg (change {pct_change:+.1f}%). "
                    f"7-day avg ₹{avg7}/kg. "
                    f"Trend: declining {trend_days} consecutive days."
                )

                # 6 — ReAct step
                thought, action, raw = await self.react.step(observation)
                await publish({
                    "agent": "price_monitor",
                    "type": "react_step",
                    "thought": thought,
                    "action": action,
                    "raw": raw,
                    "price": modal_price,
                })

                # 7 — Act on decision
                if action.startswith("TRIGGER_BUY") and not self._triggered_this_cycle:
                    self._triggered_this_cycle = True
                    await self._handle_trigger_buy(modal_price, avg7, pct_change, raw)

                if action.startswith(("WAIT", "SKIP_ANOMALY")):
                    if modal_price > threshold:
                        # Price recovered — allow fresh trigger next dip
                        self._triggered_this_cycle = False

            except Exception as exc:
                log.exception("Price monitor error")
                await publish({
                    "agent": "price_monitor",
                    "type": "error",
                    "message": str(exc),
                })
                await asyncio.sleep(60)
                continue

            await asyncio.sleep(self.charter["poll_interval_sec"])

    # ── Trigger buy pipeline ──────────────────────────────────────────

    async def _handle_trigger_buy(
        self,
        modal_price: float,
        avg7: float,
        pct_change: float,
        raw: str,
    ) -> None:
        lot_id = "LOT-" + uuid4().hex[:8].upper()
        qty = self.charter["max_lot_kg"]

        # On-chain log (price observation — no escrow spend)
        if self.contract is not None and PRICE_MONITOR_PRIVATE_KEY:
            try:
                tx_hash = send_tx(
                    self.contract.functions.recordPurchase(
                        0, int(modal_price * 100), lot_id
                    ),
                    PRICE_MONITOR_PRIVATE_KEY,
                )
                await publish({
                    "agent": "price_monitor",
                    "type": "onchain_event",
                    "event": "PriceObservationLogged",
                    "tx_hash": tx_hash,
                    "etherscan": f"https://sepolia.etherscan.io/tx/{tx_hash}",
                    "price": modal_price,
                    "lot_id": lot_id,
                })
            except Exception as exc:
                log.warning("On-chain log failed: %s", exc)
                await publish({
                    "agent": "price_monitor",
                    "type": "warning",
                    "message": f"on-chain log failed: {exc}",
                })
        else:
            await publish({
                "agent": "price_monitor",
                "type": "warning",
                "message": "on-chain log skipped — contract not configured",
            })

        # A2A → Procurement
        msg = A2AMessage(
            task_id=new_task_id(),
            from_agent="price_monitor",
            to_agent="procurement",
            capability="buy_signal",
            payload={
                "lot_id": lot_id,
                "price_per_kg": modal_price,
                "quantity_kg": qty,
                "mandi": "Jodhpur",
                "commodity": "Moong Dal",
                "avg7": avg7,
                "pct_change": pct_change,
                "llm_reasoning": raw,
            },
        )
        try:
            await send_a2a(PROCUREMENT_AGENT_URL, msg)
            await publish({
                "agent": "price_monitor",
                "type": "a2a_sent",
                "to": "procurement",
                "capability": "buy_signal",
                "lot_id": lot_id,
                "price": modal_price,
            })
        except Exception as exc:
            log.warning("A2A to procurement failed: %s", exc)
            await publish({
                "agent": "price_monitor",
                "type": "error",
                "message": f"A2A to procurement failed: {exc}",
            })
