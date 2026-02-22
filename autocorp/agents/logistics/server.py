"""
Logistics Relay Server — FastAPI on port 8005.

This Python server acts as an A2A relay for the JS logistics agent
running on port 3002. It provides SSE events and A2A compatibility
for the Python agent ecosystem while forwarding actual delivery work
to the JavaScript logistics agent.
"""

from __future__ import annotations

import json
import os
import time

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from autocorp.core.event_bus import publish, subscribe

app = FastAPI(title="AutoCorp Logistics Relay", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

JS_LOGISTICS_URL = os.getenv("LOGISTICS_URL", "http://localhost:3002")


class TransferRequest(BaseModel):
    transfer_id: str = ""
    category: str = "crypto"
    item: str = ""
    quantity: float = 0
    from_location: str = ""
    to_location: str = ""
    metadata: dict = {}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "agent": "logistics_relay",
        "port": 8005,
        "note": f"JS logistics on {JS_LOGISTICS_URL}",
    }


@app.get("/.well-known/agent.json")
async def agent_card():
    return {
        "name": "AutoCorp Logistics Relay",
        "url": "http://localhost:8005",
        "version": "2.0.0",
        "capabilities": ["digital_delivery", "initiate_transfer", "verify_delivery"],
        "primary_logistics_url": JS_LOGISTICS_URL,
    }


@app.post("/configure")
async def configure(charter: dict):
    return {"status": "configured", "primary": JS_LOGISTICS_URL}


@app.post("/start")
async def start():
    return {"status": "ok"}


@app.post("/transfer")
async def initiate_transfer(req: TransferRequest):
    """Initiate a transfer by forwarding to JS logistics agent."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"{JS_LOGISTICS_URL}/transfer",
                json=req.model_dump(),
            )
            result = r.json()
    except Exception as e:
        result = {"status": "error", "error": str(e)}

    await publish({
        "agent": "logistics_relay",
        "type": "transfer_forwarded",
        "to": "logistics_js",
        "transfer_id": req.transfer_id,
        "ts": time.time(),
    })
    return result


@app.post("/tasks/send")
async def receive_a2a(message: dict):
    """Forward A2A messages to JS logistics agent."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"{JS_LOGISTICS_URL}/tasks/send",
                json=message,
            )
            result = r.json()
    except Exception as e:
        result = {"status": "error", "error": str(e)}

    await publish({
        "agent": "logistics_relay",
        "type": "a2a_forwarded",
        "to": "logistics_js",
        "capability": message.get("capability"),
        "ts": time.time(),
    })
    return result


@app.get("/events")
async def events():
    async def stream():
        q = await subscribe("logistics_relay_events")
        while True:
            event = await q.get()
            yield f"data: {json.dumps(event)}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("LOGISTICS_RELAY_PORT", "8005")))
