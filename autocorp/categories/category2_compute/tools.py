"""Category 2 — GPU Compute arbitrage tools. Vast.ai + RunPod via mock API."""
import os, time, httpx, json
from autocorp.core.config import DEMO_MODE, MOCK_URL

_V = (MOCK_URL + "/vastai") if DEMO_MODE else "https://console.vast.ai"
_R = (MOCK_URL + "/runpod") if DEMO_MODE else "https://api.runpod.io"

async def search_vastai_gpus(gpu_type: str = "RTX_3090") -> list[dict]:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{_V}/api/v0/bundles", params={"q": gpu_type})
        r.raise_for_status()
        offers = r.json().get("offers", [])
        return [{"platform": "vast.ai", "gpu": o["gpu_name"], "price_hr": o["dph_total"],
                 "id": o["id"], "ts": time.time()} for o in offers[:5]]

async def rent_vastai_gpu(offer_id: int, gpu_type: str = "RTX_3090") -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(f"{_V}/api/v0/asks/{offer_id}", json={"gpu_name": gpu_type, "num_gpus": 1})
        r.raise_for_status()
        return r.json()

async def search_runpod_gpus() -> list[dict]:
    query = '{ gpuTypes { id displayName securePrice } }'
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(f"{_R}/graphql", json={"query": query},
                         headers={"Authorization": f"Bearer {os.getenv('RUNPOD_API_KEY','demo')}"})
        r.raise_for_status()
        types = r.json().get("data", {}).get("gpuTypes", [])
        return [{"platform": "runpod", "gpu": t["id"], "price_hr": t["securePrice"],
                 "display": t["displayName"], "ts": time.time()} for t in types[:5]]

async def list_gpu_on_runpod(instance_id: str, price_hr: float) -> dict:
    return {"listing_id": f"listing-{int(time.time())}", "instance": instance_id,
            "price_hr": price_hr, "status": "active", "ts": time.time()}

async def check_runpod_listing_sold(listing_id: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{_R}/listing/{listing_id}")
        r.raise_for_status()
        return r.json()

def calculate_gpu_profit(buy_price: float, sell_price: float, hours: float = 48) -> dict:
    cost = buy_price * hours
    revenue = sell_price * hours
    profit = revenue - cost
    roi = (profit / cost * 100) if cost else 0
    return {"cost_usd": round(cost,2), "revenue_usd": round(revenue,2),
            "profit_usd": round(profit,2), "roi_pct": round(roi,2), "hours": hours}

COMPUTE_TOOLS = [search_vastai_gpus, rent_vastai_gpu, search_runpod_gpus,
                 list_gpu_on_runpod, check_runpod_listing_sold, calculate_gpu_profit]
