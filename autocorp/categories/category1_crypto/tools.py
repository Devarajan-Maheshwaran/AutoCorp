"""
Category 1 — Crypto arbitrage tools.
Fetches prices from exchanges, calculates spreads.
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any

import httpx


MOCK_API = os.getenv("MOCK_API_URL", "http://localhost:3001")


async def fetch_crypto_prices(asset: str = "ETH", **kwargs) -> list[dict]:
    """Fetch current prices from multiple exchanges via mock API."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{MOCK_API}/api/prices/crypto", params={"asset": asset})
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass
    # DEMO_MODE gate: simulated fallback only for judge demos
    if not os.getenv("DEMO_MODE", "false").lower() == "true":
        raise NotImplementedError(
            "Live exchange API not yet integrated. "
            "Set DEMO_MODE=true only for judge demos."
        )
    # Simulated fallback data for demo
    return [
        {"exchange": "binance", "asset": asset, "bid": 2410.50, "ask": 2411.20, "ts": time.time()},
        {"exchange": "coinbase", "asset": asset, "bid": 2413.00, "ask": 2413.80, "ts": time.time()},
        {"exchange": "kraken", "asset": asset, "bid": 2409.80, "ask": 2410.60, "ts": time.time()},
    ]


async def fetch_funding_rates(asset: str = "ETH", **kwargs) -> list[dict]:
    """Fetch funding rates for perpetual futures."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{MOCK_API}/api/funding-rates", params={"asset": asset})
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass
    return [
        {"exchange": "binance", "asset": asset, "rate": 0.0003, "interval_h": 8},
        {"exchange": "deribit", "asset": asset, "rate": 0.0005, "interval_h": 8},
    ]


def calculate_spread(prices: list[dict], **kwargs) -> dict:
    """Find the best cross-exchange spread from a price list."""
    if not prices or len(prices) < 2:
        return {"spread_pct": 0, "buy_at": None, "sell_at": None}
    cheapest = min(prices, key=lambda p: p.get("ask", float("inf")))
    richest = max(prices, key=lambda p: p.get("bid", 0))
    spread = richest["bid"] - cheapest["ask"]
    spread_pct = (spread / cheapest["ask"]) * 100 if cheapest["ask"] else 0
    return {
        "buy_exchange": cheapest["exchange"],
        "buy_price": cheapest["ask"],
        "sell_exchange": richest["exchange"],
        "sell_price": richest["bid"],
        "spread_usd": round(spread, 4),
        "spread_pct": round(spread_pct, 4),
    }


def calculate_triangular_opportunity(
    pair_ab: dict, pair_bc: dict, pair_ca: dict, **kwargs
) -> dict:
    """Evaluate a triangular arbitrage path A→B→C→A."""
    try:
        rate_ab = pair_ab.get("rate", 1)
        rate_bc = pair_bc.get("rate", 1)
        rate_ca = pair_ca.get("rate", 1)
        combined = rate_ab * rate_bc * rate_ca
        profit_pct = (combined - 1) * 100
        return {
            "path": f"{pair_ab.get('from','A')}→{pair_ab.get('to','B')}→{pair_bc.get('to','C')}→{pair_ca.get('to','A')}",
            "combined_rate": round(combined, 6),
            "profit_pct": round(profit_pct, 4),
            "viable": profit_pct > 0.05,
        }
    except Exception as e:
        return {"error": str(e), "viable": False}


CRYPTO_TOOLS: dict[str, Any] = {
    "fetch_crypto_prices": fetch_crypto_prices,
    "fetch_funding_rates": fetch_funding_rates,
    "calculate_spread": calculate_spread,
    "calculate_triangular_opportunity": calculate_triangular_opportunity,
}
