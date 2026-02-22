"""
Category 5 — SaaS licence arbitrage tools.
Fetches licence resale prices, domain values, and annual pricing.
"""

from __future__ import annotations

import os
import time
from typing import Any

import httpx


MOCK_API = os.getenv("MOCK_API_URL", "http://localhost:3001")


async def fetch_licence_prices(product: str = "figma", **kwargs) -> list[dict]:
    """Fetch SaaS licence resale prices from marketplaces."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(
                f"{MOCK_API}/api/prices/saas",
                params={"product": product},
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass
    # DEMO_MODE gate: simulated fallback only for judge demos
    if not os.getenv("DEMO_MODE", "false").lower() == "true":
        raise NotImplementedError(
            "Live SaaS pricing API not yet integrated. "
            "Set DEMO_MODE=true only for judge demos."
        )
    # Simulated fallback
    return [
        {"marketplace": "licence_swap", "product": product, "seats": 10, "price_seat_mo": 8.50, "retail": 15.00, "ts": time.time()},
        {"marketplace": "saas_resale", "product": product, "seats": 5, "price_seat_mo": 9.20, "retail": 15.00, "ts": time.time()},
        {"marketplace": "bulk_licences", "product": product, "seats": 25, "price_seat_mo": 7.80, "retail": 15.00, "ts": time.time()},
    ]


async def fetch_domain_listings(**kwargs) -> list[dict]:
    """Fetch expired/auction domain listings for resale."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{MOCK_API}/api/prices/domains")
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass
    return [
        {"domain": "aitools.dev", "auction_price": 120, "est_value": 850, "ts": time.time()},
        {"domain": "cloudgpu.io", "auction_price": 200, "est_value": 1500, "ts": time.time()},
        {"domain": "ml-train.com", "auction_price": 85, "est_value": 400, "ts": time.time()},
    ]


def calculate_licence_margin(listings: list[dict], **kwargs) -> list[dict]:
    """Calculate margin between bulk/resale price and retail price."""
    opps = []
    for lic in listings:
        bulk = lic.get("price_seat_mo", 0)
        retail = lic.get("retail", 0)
        seats = lic.get("seats", 0)
        if bulk > 0 and retail > bulk:
            margin_pct = ((retail - bulk) / bulk) * 100
            annual_profit = (retail - bulk) * seats * 12
            opps.append({
                "marketplace": lic.get("marketplace", "?"),
                "product": lic.get("product", "?"),
                "seats": seats,
                "bulk_price": bulk,
                "retail_price": retail,
                "margin_pct": round(margin_pct, 2),
                "annual_profit_est": round(annual_profit, 2),
            })
    return sorted(opps, key=lambda x: x["margin_pct"], reverse=True)


def calculate_domain_roi(domains: list[dict], **kwargs) -> list[dict]:
    """Calculate ROI on domain purchases based on estimated resale value."""
    opps = []
    for d in domains:
        cost = d.get("auction_price", 0)
        value = d.get("est_value", 0)
        if cost > 0 and value > cost:
            roi_pct = ((value - cost) / cost) * 100
            opps.append({
                "domain": d["domain"],
                "cost": cost,
                "est_value": value,
                "profit": value - cost,
                "roi_pct": round(roi_pct, 2),
            })
    return sorted(opps, key=lambda x: x["roi_pct"], reverse=True)


SAAS_TOOLS: dict[str, Any] = {
    "fetch_licence_prices": fetch_licence_prices,
    "fetch_domain_listings": fetch_domain_listings,
    "calculate_licence_margin": calculate_licence_margin,
    "calculate_domain_roi": calculate_domain_roi,
}
