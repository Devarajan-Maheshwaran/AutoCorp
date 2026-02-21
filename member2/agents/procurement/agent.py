"""
Procurement Agent — validates buy signals, verifies escrow, places orders,
records purchases on Sepolia, and dispatches pickup to Logistics.

Reasoning loop (triggered by A2A ``buy_signal`` from Price Monitor):
  1. Validate budget, quality, mandi availability
  2. CALL_TOOL → get_escrow_balance (real Sepolia read)
  3. CALL_TOOL → place_buy_order (simulated eNAM)
  4. Final action: EXECUTE_BUY | REJECT_BUDGET | REJECT_QUALITY | REJECT_MANDI_CLOSED
  5. On EXECUTE_BUY → recordPurchase on-chain + A2A pickup_ready to Logistics
"""

from __future__ import annotations

import asyncio
import logging

from member2.shared.a2a import A2AMessage, new_task_id, send_a2a
from member2.shared.blockchain import (
    get_business_contract,
    get_escrow_balance,
    send_tx,
)
from member2.shared.config import (
    BUSINESS_ENTITY_ADDRESS,
    CHARTER,
    LOGISTICS_AGENT_URL,
    PROCUREMENT_PRIVATE_KEY,
)
from member2.shared.event_bus import publish
from member2.shared.llm import ReActAgent
from member2.mcp_server.tools import place_buy_order as _mcp_place_buy_order

log = logging.getLogger(__name__)

# ── System prompt ──────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are the Procurement Agent for AutoCorp. You receive buy signals from the \
Price Monitor and decide whether to execute the actual purchase from Jodhpur mandi.

You have access to two tools:
  get_escrow_balance — returns live escrow ETH balance from Sepolia smart contract
  place_buy_order    — [SIMULATED] places a buy order on mock eNAM

You must validate three conditions before executing:
1. Budget: cost (price × qty) must be within remaining escrow budget.
   Use get_escrow_balance tool if you are unsure of current balance.
2. Quality: grade A or B is acceptable. Grade C = reject (Mumbai buyers won't pay margin).
3. Mandi status: open. (Provided in observation. If closed = reject.)

Always respond in EXACTLY this format:
Thought: <your validation reasoning>
Action: EXECUTE_BUY | reason: <why all conditions passed>
   OR
Action: REJECT_BUDGET | reason: <budget numbers>
   OR
Action: REJECT_QUALITY | reason: <quality issue and margin impact>
   OR
Action: REJECT_MANDI_CLOSED | reason: <why>
   OR
Action: CALL_TOOL | tool: get_escrow_balance | args: {}
   OR
Action: CALL_TOOL | tool: place_buy_order | args: {"lot_id":"...","quantity_kg":200,"max_price_per_kg":78.0}

--- Example 1: Check balance then execute ---
Observation: Buy signal. Price ₹78/kg, qty 200kg, cost ₹15,600.
Budget tracked locally: ₹28,400 remaining. Quality: A. Mandi: open.
Thought: Local budget tracker shows ₹28,400 remaining. Cost ₹15,600 fits.
But before spending escrow, I should verify on-chain balance is consistent.
Action: CALL_TOOL | tool: get_escrow_balance | args: {}

Tool result for get_escrow_balance: {"balance_eth": 0.24, "address": "0x..."}
Thought: On-chain balance confirms sufficient funds. Quality grade A is premium.
Mandi open. Placing the buy order now.
Action: CALL_TOOL | tool: place_buy_order | args: {"lot_id":"LOT-A1B2C3D4","quantity_kg":200,"max_price_per_kg":78.0}

Tool result for place_buy_order: {"status":"confirmed","lot_id":"LOT-A1B2C3D4","actual_price_per_kg":77.5,"quality_grade":"A","simulated":true}
Thought: Order confirmed at ₹77.5/kg — slightly better than signal price.
All conditions met. Executing final purchase record.
Action: EXECUTE_BUY | reason: balance verified on-chain, grade A, order confirmed at ₹77.5

--- Example 2: Budget rejection ---
Observation: Buy signal. Price ₹77/kg, qty 200kg, cost ₹15,400.
Budget remaining ₹9,800. Quality: A. Mandi: open.
Thought: Cost ₹15,400 exceeds remaining budget ₹9,800 by ₹5,600. Cannot \
exceed escrow — this leaves nothing for transport and agent fees.
Action: REJECT_BUDGET | reason: cost ₹15,400 > budget ₹9,800, shortfall ₹5,600

--- Example 3: Quality rejection ---
Observation: Buy signal. Price ₹79/kg, qty 200kg, cost ₹15,800.
Budget remaining ₹22,000. Quality: C. Mandi: open.
Thought: Budget is fine but grade C means moisture damage or mixed grading.
Mumbai wholesalers discount grade C by ₹8-12/kg which eliminates our 15% \
margin target. Not worth buying.
Action: REJECT_QUALITY | reason: grade C, Mumbai discount ₹8-12/kg eliminates 15% margin\
"""


# ── Agent ──────────────────────────────────────────────────────────────────


class ProcurementAgent:
    """Validates buy signals, verifies escrow, places orders, records on-chain."""

    def __init__(self) -> None:
        self.tool_registry = {
            "get_escrow_balance": self._tool_get_balance,
            "place_buy_order": self._tool_place_order,
        }
        self.react = ReActAgent(
            SYSTEM_PROMPT,
            tool_registry=self.tool_registry,
        )
        self.budget_spent: float = 0.0
        self._queue: asyncio.Queue = asyncio.Queue()
        self.charter = CHARTER
        self.contract = get_business_contract()

    # ── Properties ────────────────────────────────────────────────────

    def budget_remaining(self) -> float:
        return self.charter["budget_inr"] - self.budget_spent

    # ── MCP tool callables ────────────────────────────────────────────

    async def _tool_get_balance(self, args: dict) -> dict:  # noqa: ARG002
        balance = get_escrow_balance()
        return {
            "balance_eth": balance if balance is not None else 0.0,
            "address": BUSINESS_ENTITY_ADDRESS or "(not set)",
        }

    async def _tool_place_order(self, args: dict) -> dict:
        return await _mcp_place_buy_order(
            lot_id=args.get("lot_id", ""),
            quantity_kg=int(args.get("quantity_kg", 0)),
            max_price_per_kg=float(args.get("max_price_per_kg", 0)),
        )

    # ── Inbound A2A ──────────────────────────────────────────────────

    async def receive_signal(self, payload: dict) -> None:
        await self._queue.put(payload)

    # ── Signal processing ─────────────────────────────────────────────

    async def process_signal(self, signal: dict) -> None:
        price = signal["price_per_kg"]
        qty = signal["quantity_kg"]
        lot_id = signal["lot_id"]
        cost = round(price * qty, 2)
        quality = signal.get("quality_grade", "A")
        remaining = self.budget_remaining()

        # Fresh reasoning context per lot
        self.react.reset_history()

        await publish({
            "agent": "procurement",
            "type": "signal_received",
            "lot_id": lot_id,
            "price": price,
            "qty": qty,
            "cost": cost,
            "budget_remaining": remaining,
            "quality": quality,
        })

        observation = (
            f"Buy signal. Price ₹{price}/kg, qty {qty}kg, cost ₹{cost}. "
            f"Budget tracked locally: ₹{remaining} remaining. "
            f"Quality grade: {quality}. Mandi: open."
        )

        thought, action, raw = await self.react.step(observation)

        await publish({
            "agent": "procurement",
            "type": "react_step",
            "thought": thought,
            "action": action,
            "raw": raw,
            "lot_id": lot_id,
        })

        if action.startswith("EXECUTE_BUY"):
            await self._handle_execute_buy(lot_id, qty, price, cost, quality)
        elif action.startswith("REJECT"):
            await publish({
                "agent": "procurement",
                "type": "rejected",
                "action": action,
                "lot_id": lot_id,
                "reason": action,
            })

    # ── Execute buy pipeline ──────────────────────────────────────────

    async def _handle_execute_buy(
        self,
        lot_id: str,
        qty: int,
        price: float,
        cost: float,
        quality: str,
    ) -> None:
        tx_hash = ""

        # On-chain recordPurchase (first real escrow spend)
        if self.contract is not None and PROCUREMENT_PRIVATE_KEY:
            try:
                tx_hash = send_tx(
                    self.contract.functions.recordPurchase(
                        qty, int(price * 100), lot_id
                    ),
                    PROCUREMENT_PRIVATE_KEY,
                )
                self.budget_spent += cost
                await publish({
                    "agent": "procurement",
                    "type": "onchain_event",
                    "event": "PurchaseRecorded",
                    "tx_hash": tx_hash,
                    "etherscan": f"https://sepolia.etherscan.io/tx/{tx_hash}",
                    "qty": qty,
                    "price_per_kg": price,
                    "lot_id": lot_id,
                    "total_cost": cost,
                })
            except Exception as exc:
                log.exception("On-chain recordPurchase failed")
                await publish({
                    "agent": "procurement",
                    "type": "error",
                    "message": f"on-chain recordPurchase failed: {exc}",
                    "lot_id": lot_id,
                })
                return  # Do NOT update budget or dispatch logistics
        else:
            # No contract — still proceed with A2A but warn
            self.budget_spent += cost
            await publish({
                "agent": "procurement",
                "type": "warning",
                "message": "on-chain recordPurchase skipped — contract not configured",
                "lot_id": lot_id,
            })

        # A2A → Logistics Agent (Member 4)
        msg = A2AMessage(
            task_id=new_task_id(),
            from_agent="procurement",
            to_agent="logistics",
            capability="pickup_ready",
            payload={
                "lot_id": lot_id,
                "quantity_kg": qty,
                "price_per_kg": price,
                "total_cost": cost,
                "pickup_address": (
                    "Jodhpur Agricultural Produce Market, "
                    "Krishi Mandi, Jodhpur, Rajasthan 342001"
                ),
                "destination": "Mumbai",
                "commodity": "Moong Dal",
                "quality_grade": quality,
                "procurement_tx": tx_hash,
            },
        )
        try:
            await send_a2a(LOGISTICS_AGENT_URL, msg)
            await publish({
                "agent": "procurement",
                "type": "a2a_sent",
                "to": "logistics",
                "capability": "pickup_ready",
                "lot_id": lot_id,
                "total_cost": cost,
            })
        except Exception as exc:
            log.warning("A2A to logistics failed: %s", exc)
            await publish({
                "agent": "procurement",
                "type": "error",
                "message": f"A2A to logistics failed: {exc}",
                "lot_id": lot_id,
            })

    # ── Main loop ─────────────────────────────────────────────────────

    async def run(self) -> None:
        await publish({
            "agent": "procurement",
            "type": "status",
            "status": "running",
        })

        while True:
            signal = await self._queue.get()
            asyncio.create_task(self.process_signal(signal))
