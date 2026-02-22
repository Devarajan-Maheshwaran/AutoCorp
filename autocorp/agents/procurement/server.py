"""
Procurement Agent Server — FastAPI server on port 8003.
Dynamically loads the correct category procurement agent based on the charter.
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
from autocorp.core.agent_factory import get_procurement

app = FastAPI(title="Procurement Agent", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

agent_instance = None
agent_task = None


class CharterPayload(BaseModel):
    charter: dict


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "agent": "procurement",
        "port": 8003,
        "running": agent_instance is not None and getattr(agent_instance, 'running', False),
    }


@app.get("/.well-known/agent.json")
async def agent_card():
    return {
        "name": "AutoCorp Procurement",
        "url": "http://localhost:8003",
        "version": "2.0.0",
        "capabilities": ["execute_purchase", "manage_budget"],
        "supported_categories": ["1_crypto", "2_compute", "5_saas"],
        "port": 8003,
    }


@app.post("/configure")
async def configure(charter: dict):
    global agent_instance
    agent_instance = get_procurement(charter)
    return {"status": "configured", "category": charter.get("category")}


@app.post("/start")
async def start():
    if agent_instance is None:
        raise HTTPException(status_code=400, detail="Agent not configured.")
    return {"status": "ok", "message": "Procurement agent awaiting buy signals"}


@app.post("/charter")
async def set_charter(payload: CharterPayload):
    global agent_instance, agent_task
    if agent_instance and getattr(agent_instance, 'running', False):
        agent_instance.stop()
        if agent_task:
            agent_task.cancel()
    agent_instance = get_procurement(payload.charter)
    return {"status": "started", "category": payload.charter.get("category")}


@app.post("/tasks/send")
async def receive_task(body: dict):
    """A2A task endpoint — receive buy signals from price monitor."""
    capability = body.get("capability")
    payload = body.get("payload", {})

    if capability == "buy_signal" and agent_instance:
        try:
            await agent_instance.handle_buy_signal(payload)
            return {"status": "executed", "task_id": body.get("task_id", "?")}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    return {"status": "received", "task_id": body.get("task_id", "?")}


@app.post("/stop")
async def stop_agent():
    global agent_instance, agent_task
    if agent_instance and hasattr(agent_instance, 'stop'):
        agent_instance.stop()
    return {"status": "stopped"}


@app.get("/events")
async def events():
    async def stream():
        q = await subscribe("procurement_events")
        while True:
            event = await q.get()
            yield f"data: {json.dumps(event)}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PROCUREMENT_PORT", "8003")))
