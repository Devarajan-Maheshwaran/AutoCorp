"""
Accountant Agent Server — FastAPI server on port 8006.
Tracks P&L, escrow balances, and generates financial reports.
Category-agnostic: works with any asset type.
"""

from __future__ import annotations

import asyncio
import json
import os
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from autocorp.core.event_bus import publish, subscribe

app = FastAPI(title="AutoCorp Accountant", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# In-memory P&L ledger
state = {
    "total_invested": 0.0,
    "total_spent": 0.0,
    "total_revenue": 0.0,
    "gross_profit": 0.0,
    "roi_pct": 0.0,
    "lots_purchased": 0,
    "lots_sold": 0,
    "open_trades": 0,
    "last_updated": "",
    "trades": [],
    "by_category": {},
}

running = False
listener_task = None


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "accountant", "port": 8006, "running": running}


@app.get("/.well-known/agent.json")
async def agent_card():
    return {
        "name": "AutoCorp Accountant",
        "url": "http://localhost:8006",
        "version": "2.0.0",
        "capabilities": ["pnl_tracking", "sale_report", "dissolution_summary"],
        "supported_categories": ["1_crypto", "2_compute", "5_saas"],
    }


@app.post("/configure")
async def configure(charter: dict):
    state["total_invested"] = charter.get("budget_usdc", charter.get("budgetUsd", 0.0))
    return {"status": "configured"}


@app.post("/start")
async def start():
    return {"status": "ok", "message": "Accountant always running"}


@app.post("/tasks/send")
async def receive_a2a(message: dict):
    capability = message.get("capability")
    payload = message.get("payload", {})

    if capability == "sale_report":
        net = float(payload.get("net_profit_usdc", 0))
        cat = payload.get("category", "unknown")
        state["total_revenue"] += net
        state["gross_profit"] = state["total_revenue"] - state["total_spent"]
        state["lots_sold"] += 1
        state["open_trades"] = max(0, state["open_trades"] - 1)
        state["roi_pct"] = (
            (state["gross_profit"] / state["total_spent"]) * 100
            if state["total_spent"] > 0 else 0.0
        )
        state["last_updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        state["trades"].append({
            "lot_id": payload.get("lot_id"),
            "net_profit_usdc": net,
            "strategy": payload.get("strategy"),
            "category": cat,
            "ts": payload.get("ts", time.time()),
        })

        # By-category tracking
        if cat not in state["by_category"]:
            state["by_category"][cat] = {"spent": 0, "revenue": 0, "pnl": 0}
        state["by_category"][cat]["revenue"] += net
        state["by_category"][cat]["pnl"] = (
            state["by_category"][cat]["revenue"] - state["by_category"][cat]["spent"]
        )

        await publish({
            "agent": "accountant",
            "type": "pnl_updated",
            "pnl": dict(state),
            "ts": time.time(),
        })

    elif capability == "trade_opened":
        cost = float(payload.get("cost_usdc", 0))
        cat = payload.get("category", "unknown")
        state["total_spent"] += cost
        state["lots_purchased"] += 1
        state["open_trades"] += 1
        state["last_updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        if cat not in state["by_category"]:
            state["by_category"][cat] = {"spent": 0, "revenue": 0, "pnl": 0}
        state["by_category"][cat]["spent"] += cost
        state["by_category"][cat]["pnl"] = (
            state["by_category"][cat]["revenue"] - state["by_category"][cat]["spent"]
        )

    return {"status": "ok"}


@app.get("/state")
async def get_state():
    return state


@app.get("/pnl")
async def get_pnl():
    return {
        "total_spent": state["total_spent"],
        "total_revenue": state["total_revenue"],
        "net_pnl": state["gross_profit"],
        "by_category": state["by_category"],
        "trade_count": state["lots_purchased"] + state["lots_sold"],
    }


@app.get("/events")
async def events():
    async def stream():
        q = await subscribe("accountant_events")
        while True:
            event = await q.get()
            yield f"data: {json.dumps(event)}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")


async def _track_events():
    """Background: listen for purchase and sale events to update ledger."""
    global running
    running = True
    purchase_q = await subscribe("purchase_executed")
    sale_q = await subscribe("sale_executed")

    while running:
        done, _ = await asyncio.wait(
            [
                asyncio.create_task(purchase_q.get()),
                asyncio.create_task(sale_q.get()),
            ],
            timeout=30,
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in done:
            try:
                event = task.result()
                cat = event.get("category", "unknown")

                if "purchase" in event.get("type", ""):
                    cost = event.get("cost", 0)
                    state["total_spent"] += cost
                    state["lots_purchased"] += 1
                    if cat not in state["by_category"]:
                        state["by_category"][cat] = {"spent": 0, "revenue": 0, "pnl": 0}
                    state["by_category"][cat]["spent"] += cost
                elif "sale" in event.get("type", ""):
                    profit = event.get("net_profit", 0)
                    state["total_revenue"] += profit
                    state["lots_sold"] += 1
                    if cat not in state["by_category"]:
                        state["by_category"][cat] = {"spent": 0, "revenue": 0, "pnl": 0}
                    state["by_category"][cat]["revenue"] += profit

                state["gross_profit"] = state["total_revenue"] - state["total_spent"]
                state["roi_pct"] = (
                    (state["gross_profit"] / state["total_spent"]) * 100
                    if state["total_spent"] > 0 else 0.0
                )
                state["last_updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

                for c in state["by_category"]:
                    state["by_category"][c]["pnl"] = (
                        state["by_category"][c]["revenue"]
                        - state["by_category"][c]["spent"]
                    )

                await publish({
                    "agent": "accountant",
                    "type": "pnl_updated",
                    "pnl": dict(state),
                    "ts": time.time(),
                })

            except Exception as e:
                print(f"[Accountant] Error processing event: {e}")


@app.on_event("startup")
async def startup():
    global listener_task
    listener_task = asyncio.create_task(_track_events())


@app.post("/stop")
async def stop():
    global running
    running = False
    return {"status": "stopped"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("ACCOUNTANT_PORT", "8006")))
