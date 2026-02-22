"""
Category 2 — Compute / GPU arbitrage tools.
Fetches spot GPU prices, API credit rates, and calculates spread.
"""

from __future__ import annotations

import os
import time
from typing import Any

import httpx


MOCK_API = os.getenv("MOCK_API_URL", "http://localhost:3001")


async def fetch_gpu_spot_prices(gpu_type: str = "A100", **kwargs) -> list[dict]:
    """Fetch current GPU spot prices from cloud providers."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(
                f"{MOCK_API}/api/prices/compute",
                params={"gpu_type": gpu_type},
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass
    # DEMO_MODE gate: simulated fallback only for judge demos
    if not os.getenv("DEMO_MODE", "false").lower() == "true":
        raise NotImplementedError(
            "Live GPU pricing API not yet integrated. "
            "Set DEMO_MODE=true only for judge demos."
        )
    # Simulated fallback
    return [
        {"provider": "lambda_labs", "gpu": gpu_type, "price_hr": 1.10, "available": True, "ts": time.time()},
        {"provider": "vast_ai", "gpu": gpu_type, "price_hr": 0.85, "available": True, "ts": time.time()},
        {"provider": "runpod", "gpu": gpu_type, "price_hr": 1.25, "available": True, "ts": time.time()},
        {"provider": "aws_spot", "gpu": gpu_type, "price_hr": 1.65, "available": True, "ts": time.time()},
    ]


async def fetch_api_credit_prices(**kwargs) -> list[dict]:
    """Fetch resale prices for compute API credits (e.g., OpenAI, Anthropic)."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{MOCK_API}/api/prices/api-credits")
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass
    return [
        {"platform": "openai", "credit_type": "GPT-4o", "retail_per_1k": 5.00, "bulk_per_1k": 3.80, "ts": time.time()},
        {"platform": "anthropic", "credit_type": "Claude", "retail_per_1k": 4.50, "bulk_per_1k": 3.50, "ts": time.time()},
    ]


def calculate_compute_spread(prices: list[dict], **kwargs) -> dict:
    """Find cheapest and most expensive GPU providers for arbitrage."""
    if not prices or len(prices) < 2:
        return {"spread_pct": 0, "buy_at": None, "sell_at": None}
    available = [p for p in prices if p.get("available", True)]
    if len(available) < 2:
        return {"spread_pct": 0, "buy_at": None, "sell_at": None}
    cheapest = min(available, key=lambda p: p.get("price_hr", float("inf")))
    richest = max(available, key=lambda p: p.get("price_hr", 0))
    spread = richest["price_hr"] - cheapest["price_hr"]
    spread_pct = (spread / cheapest["price_hr"]) * 100 if cheapest["price_hr"] else 0
    return {
        "buy_provider": cheapest["provider"],
        "buy_price_hr": cheapest["price_hr"],
        "sell_provider": richest["provider"],
        "sell_price_hr": richest["price_hr"],
        "spread_hr": round(spread, 4),
        "spread_pct": round(spread_pct, 2),
        "gpu": cheapest.get("gpu", "A100"),
    }


def calculate_credit_arbitrage(credits: list[dict], **kwargs) -> list[dict]:
    """Calculate arbitrage on API credits (bulk buy → retail resale)."""
    opps = []
    for c in credits:
        bulk = c.get("bulk_per_1k", 0)
        retail = c.get("retail_per_1k", 0)
        if bulk > 0 and retail > bulk:
            margin_pct = ((retail - bulk) / bulk) * 100
            opps.append({
                "platform": c["platform"],
                "credit_type": c.get("credit_type", ""),
                "bulk_price": bulk,
                "retail_price": retail,
                "margin_pct": round(margin_pct, 2),
            })
    return sorted(opps, key=lambda x: x["margin_pct"], reverse=True)


COMPUTE_TOOLS: dict[str, Any] = {
    "fetch_gpu_spot_prices": fetch_gpu_spot_prices,
    "fetch_api_credit_prices": fetch_api_credit_prices,
    "calculate_compute_spread": calculate_compute_spread,
    "calculate_credit_arbitrage": calculate_credit_arbitrage,
}
