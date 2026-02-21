"""
FastAPI server for the Price Monitor Agent.

- Runs on port 8002
- On startup: launches PriceMonitorAgent.run() as background task
- GET  /.well-known/agent.json  → A2A agent card
- POST /tasks/send              → receives A2A messages from other agents
- GET  /events                  → SSE stream for the dashboard
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

from member2.agents.price_monitor.agent import PriceMonitorAgent
from member2.shared.a2a import A2AMessage, AgentCard
from member2.shared.event_bus import event_stream, publish, subscribe, unsubscribe

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Price Monitor Agent")

_agent: PriceMonitorAgent | None = None


# ── Lifecycle ──────────────────────────────────────────────────────────────


@app.on_event("startup")
async def _startup() -> None:
    global _agent
    _agent = PriceMonitorAgent()
    asyncio.create_task(_agent.run())


# ── A2A discovery ─────────────────────────────────────────────────────────


@app.get("/.well-known/agent.json")
async def agent_card() -> dict:
    card = AgentCard(
        name="Price Monitor Agent",
        description=(
            "Polls live Jodhpur mandi Moong Dal prices via Agmarknet. "
            "Triggers buy signals via A2A."
        ),
        url="http://localhost:8002",
        capabilities=["price_monitoring"],
    )
    return card.model_dump()


# ── A2A inbound ───────────────────────────────────────────────────────────


@app.post("/tasks/send")
async def tasks_send(msg: A2AMessage) -> dict:
    if msg.capability == "status_query" and _agent is not None:
        latest = _agent.price_window[-1] if _agent.price_window else None
        await publish({
            "agent": "price_monitor",
            "type": "status_response",
            "latest_price": latest,
            "window_size": len(_agent.price_window),
        })

    return {"status": "ok", "agent": "price_monitor"}


# ── SSE events ────────────────────────────────────────────────────────────


@app.get("/events")
async def events(request: Request) -> StreamingResponse:
    q = subscribe()

    async def _generator():
        try:
            async for chunk in event_stream(q):
                if await request.is_disconnected():
                    break
                yield chunk
        finally:
            unsubscribe(q)

    return StreamingResponse(_generator(), media_type="text/event-stream")


# ── Health ────────────────────────────────────────────────────────────────


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "agent": "price_monitor"}


# ── Direct run ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8002)
