"""
MCP Tool Server — exposes tools that agent LLMs discover and invoke.

Agents connect to this server as MCP clients. When the Gemini LLM inside
an agent decides it needs market data, wants to place an order, or needs
to check the escrow balance, it calls one of these tools by name.

Run as a subprocess: ``python -m member2.mcp_server.tools``
Transport: stdio (the MCP client spawns this process and communicates via stdin/stdout)
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from mcp.server.fastmcp import FastMCP

from member2.shared.blockchain import BUSINESS_ENTITY_ADDRESS, get_escrow_balance
from member2.shared.config import CHARTER
from member2.shared.price_feed import MandiFeed

mcp = FastMCP("AutoCorp Tools")


# ── Price feeds (real API) ─────────────────────────────────────────────────


@mcp.tool()
async def get_jodhpur_dal_price() -> dict[str, Any]:
    """Fetch live Moong Dal modal price from Jodhpur mandi via Agmarknet API."""
    return await MandiFeed.get_latest_price("Jodhpur", "Moong Dal")


@mcp.tool()
async def get_mumbai_dal_price() -> dict[str, Any]:
    """Fetch live Moong Dal modal price from Mumbai wholesale market via Agmarknet API."""
    return await MandiFeed.get_latest_price_mumbai("Moong Dal")


# ── Order placement (simulated eNAM) ──────────────────────────────────────


@mcp.tool()
async def place_buy_order(
    lot_id: str,
    quantity_kg: int,
    max_price_per_kg: float,
) -> dict[str, Any]:
    """[SIMULATED] Place a buy order on mock eNAM — explicitly allowed mock per spec."""
    actual_price = max_price_per_kg
    total_cost = round(actual_price * quantity_kg, 2)

    return {
        "status": "confirmed",
        "lot_id": lot_id,
        "quantity_kg": quantity_kg,
        "actual_price_per_kg": actual_price,
        "total_cost": total_cost,
        "quality_grade": "A",
        "pickup_address": "Jodhpur Agricultural Produce Market, Rajasthan 342001",
        "simulated": True,
    }


# ── Blockchain reads (real Sepolia) ────────────────────────────────────────


@mcp.tool()
async def get_escrow_balance_tool() -> dict[str, Any]:
    """Get current escrow balance from Sepolia smart contract."""
    balance = get_escrow_balance()
    return {
        "balance_eth": balance if balance is not None else 0.0,
        "address": BUSINESS_ENTITY_ADDRESS or "(not set)",
        "note": "None if contract not configured",
    }


# ── Payment (simulated Razorpay) ──────────────────────────────────────────


@mcp.tool()
async def create_payment_link(
    buyer_name: str,
    amount_inr: float,
    lot_id: str,
) -> dict[str, Any]:
    """[SIMULATED] Generate Razorpay payment link — explicitly allowed mock per spec."""
    short_id = uuid.uuid4().hex[:8].upper()
    return {
        "url": f"https://rzp.io/l/AUTOCORP-{short_id}",
        "amount_inr": amount_inr,
        "buyer_name": buyer_name,
        "lot_id": lot_id,
        "simulated": True,
    }


# ── Entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run(transport="stdio")
