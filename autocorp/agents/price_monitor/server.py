"""
Price Monitor Agent Server — FastAPI server on port 8002.
Dynamically loads the correct category price monitor based on the charter.
"""

from __future__ import annotations

import asyncio
import json
import os
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from autocorp.core.event_bus import publish, subscribe

app = FastAPI(title="Price Monitor Agent", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

agent_instance = None
agent_task = None


class CharterPayload(BaseModel):
    charter: dict


def _create_agent(charter: dict):
    """Factory: create the right price monitor for the charter's category."""
    category = charter.get("category", "1_crypto")
    if category == "1_crypto":
        from autocorp.categories.category1_crypto.price_monitor import CryptoPriceMonitor
        return CryptoPriceMonitor(charter)
    elif category == "2_compute":
        from autocorp.categories.category2_compute.price_monitor import ComputePriceMonitor
        return ComputePriceMonitor(charter)
    elif category == "5_saas":
        from autocorp.categories.category5_saas.price_monitor import SaaSPriceMonitor
        return SaaSPriceMonitor(charter)
    else:
        raise ValueError(f"Unknown category: {category}")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "agent": "price_monitor",
        "port": 8002,
        "running": agent_instance is not None and getattr(agent_instance, 'running', False),
    }


@app.get("/.well-known/agent.json")
async def agent_card():
    return {
        "name": "AutoCorp Price Monitor",
        "url": "http://localhost:8002",
        "version": "2.0.0",
        "capabilities": ["monitor_prices", "publish_spreads"],
        "supported_categories": ["1_crypto", "2_compute", "5_saas"],
        "port": 8002,
    }


@app.post("/configure")
async def configure(charter: dict):
    global agent_instance
    agent_instance = _create_agent(charter)
    return {"status": "configured", "category": charter.get("category")}


@app.post("/start")
async def start():
    global agent_task
    if agent_instance is None:
        raise HTTPException(status_code=400, detail="Agent not configured. Call /configure first.")
    agent_task = asyncio.create_task(agent_instance.run_loop())
    return {"status": "started"}


@app.post("/charter")
async def set_charter(payload: CharterPayload):
    global agent_instance, agent_task
    if agent_instance and getattr(agent_instance, 'running', False):
        agent_instance.stop()
        if agent_task:
            agent_task.cancel()
    agent_instance = _create_agent(payload.charter)
    agent_task = asyncio.create_task(agent_instance.run_loop())
    return {"status": "started", "category": payload.charter.get("category")}


@app.post("/tasks/send")
async def receive_task(body: dict):
    """A2A task endpoint."""
    capability = body.get("capability")
    payload = body.get("payload", {})

    if capability == "price_alert" and agent_instance:
        await publish({
            "agent": "price_monitor",
            "type": "price_alert_received",
            "payload": payload,
            "ts": time.time(),
        })

    return {"status": "received", "task_id": body.get("task_id", "?")}


@app.post("/stop")
async def stop_agent():
    global agent_instance, agent_task
    if agent_instance:
        agent_instance.stop()
    return {"status": "stopped"}


@app.get("/events")
async def events():
    async def stream():
        q = await subscribe("price_monitor_events")
        while True:
            event = await q.get()
            yield f"data: {json.dumps(event)}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PRICE_MONITOR_PORT", "8002")))
