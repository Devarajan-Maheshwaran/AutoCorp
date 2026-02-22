"""
Sales Agent Server — FastAPI server on port 8004.
Dynamically loads the correct category sales agent based on the charter.
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
from autocorp.core.agent_factory import get_sales

app = FastAPI(title="Sales Agent", version="2.0.0")
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
        "agent": "sales",
        "port": 8004,
        "running": agent_instance is not None and getattr(agent_instance, 'running', False),
    }


@app.get("/.well-known/agent.json")
async def agent_card():
    return {
        "name": "AutoCorp Sales",
        "url": "http://localhost:8004",
        "version": "2.0.0",
        "capabilities": ["execute_sale", "manage_inventory"],
        "supported_categories": ["1_crypto", "2_compute", "5_saas"],
        "port": 8004,
    }


@app.post("/configure")
async def configure(charter: dict):
    global agent_instance
    agent_instance = get_sales(charter)
    return {"status": "configured", "category": charter.get("category")}


@app.post("/start")
async def start():
    if agent_instance is None:
        raise HTTPException(status_code=400, detail="Agent not configured.")
    return {"status": "ok", "message": "Sales agent awaiting sell signals"}


@app.post("/charter")
async def set_charter(payload: CharterPayload):
    global agent_instance, agent_task
    if agent_instance and getattr(agent_instance, 'running', False):
        agent_instance.stop()
        if agent_task:
            agent_task.cancel()
    agent_instance = get_sales(payload.charter)
    return {"status": "started", "category": payload.charter.get("category")}


@app.post("/tasks/send")
async def receive_task(body: dict):
    """A2A task endpoint — receive sell-side tasks."""
    capability = body.get("capability")
    payload = body.get("payload", {})

    if capability in ("trade_executed", "instance_ready", "licence_ready") and agent_instance:
        handler_name = f"handle_{capability}"
        handler = getattr(agent_instance, handler_name, None)
        if handler:
            try:
                await handler(payload)
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
        q = await subscribe("sales_events")
        while True:
            event = await q.get()
            yield f"data: {json.dumps(event)}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("SALES_PORT", "8004")))
