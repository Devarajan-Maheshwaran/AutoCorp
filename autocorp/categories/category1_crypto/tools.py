"""Category 1 — Crypto arbitrage tools. Fetches prices from Binance, CoinDCX via mock API."""
import os, time, httpx
from autocorp.core.config import DEMO_MODE, MOCK_URL

_B = (MOCK_URL + "/binance") if DEMO_MODE else "https://api.binance.com"
_C = (MOCK_URL + "/coindcx") if DEMO_MODE else "https://api.coindcx.com"
_W = (MOCK_URL + "/wazirx")  if DEMO_MODE else "https://api.wazirx.com"

async def get_binance_price(symbol: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{_B}/api/v3/ticker/price", params={"symbol": symbol})
        r.raise_for_status()
        data = r.json()
        return {"exchange": "binance", "symbol": symbol,
                "price": float(data["price"]), "ts": time.time()}

async def get_coindcx_price(symbol: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{_C}/exchange/ticker")
        r.raise_for_status()
        tickers = r.json()
        match = next((t for t in tickers if t["market"].upper() == symbol.upper()), None)
        if not match: return {"exchange": "coindcx", "symbol": symbol, "price": 0, "ts": time.time()}
        return {"exchange": "coindcx", "symbol": symbol,
                "price": float(match["last_price"]), "ts": time.time()}

async def fetch_crypto_prices(asset: str = "ETHUSDT") -> list[dict]:
    """Fetch prices from Binance + CoinDCX."""
    b, c = await get_binance_price(asset), await get_coindcx_price(asset)
    return [b, c]

async def place_binance_buy(symbol: str, quantity: float) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(f"{_B}/api/v3/order", json={
            "symbol": symbol, "side": "BUY", "quantity": quantity
        })
        r.raise_for_status()
        return r.json()

async def place_coindcx_sell(symbol: str, quantity: float) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(f"{_C}/exchange/v1/orders/create", json={
            "market": symbol, "side": "sell", "quantity": quantity
        })
        r.raise_for_status()
        return r.json()

async def fetch_funding_rates(symbol: str = "BTCUSDT") -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{_B}/fapi/v1/fundingRate", params={"symbol": symbol})
        r.raise_for_status()
        data = r.json()
        if not data: return {"symbol": symbol, "rate": 0, "ts": time.time()}
        return {"symbol": symbol, "rate": float(data[0]["fundingRate"]),
                "next_funding": data[0]["fundingTime"], "ts": time.time()}

def calculate_spread(prices: list[dict]) -> dict:
    if len(prices) < 2: return {"spread_pct": 0, "buy_at": None, "sell_at": None}
    cheapest = min(prices, key=lambda p: p["price"])
    richest  = max(prices, key=lambda p: p["price"])
    spread   = richest["price"] - cheapest["price"]
    pct      = (spread / cheapest["price"]) * 100 if cheapest["price"] else 0
    return {"buy_exchange": cheapest["exchange"], "buy_price": cheapest["price"],
            "sell_exchange": richest["exchange"], "sell_price": richest["price"],
            "spread_usd": round(spread, 4), "spread_pct": round(pct, 4)}

CRYPTO_TOOLS = [get_binance_price, get_coindcx_price, fetch_crypto_prices,
                place_binance_buy, place_coindcx_sell, fetch_funding_rates, calculate_spread]
