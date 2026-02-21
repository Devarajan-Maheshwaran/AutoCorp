"""
FastAPI server for the Sales Agent.

- Runs on port 8004
- On startup: launches SalesAgent.run() as background task
- GET  /.well-known/agent.json  → A2A agent card
- POST /tasks/send              → receives A2A messages (delivery_confirmed)
- GET  /events                  → SSE stream for the dashboard
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

from member2.agents.sales.agent import SalesAgent
from member2.shared.a2a import A2AMessage, AgentCard
from member2.shared.event_bus import event_stream, publish, subscribe, unsubscribe

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Sales Agent")

_agent = SalesAgent()


# ── Lifecycle ──────────────────────────────────────────────────────────────


@app.on_event("startup")
async def _startup() -> None:
    asyncio.create_task(_agent.run())


# ── A2A discovery ─────────────────────────────────────────────────────────


@app.get("/.well-known/agent.json")
async def agent_card() -> dict:
    card = AgentCard(
        name="Sales Agent",
        description=(
            "Receives delivery confirmations, calculates margins, "
            "records sales on Sepolia, generates payment links."
        ),
        url="http://localhost:8004",
        capabilities=["sales"],
    )
    return card.model_dump()


# ── A2A inbound ───────────────────────────────────────────────────────────


@app.post("/tasks/send")
async def tasks_send(msg: A2AMessage) -> dict:
    await publish({
        "agent": "sales",
        "type": "a2a_received",
        "from_agent": msg.from_agent,
        "capability": msg.capability,
    })

    if msg.capability == "delivery_confirmed":
        await _agent.receive_delivery(msg.payload)

    return {"status": "ok", "agent": "sales"}


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
    return {
        "status": "ok",
        "agent": "sales",
        "total_revenue": _agent.total_revenue,
        "total_cost": _agent.total_cost,
    }


# ── Direct run ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8004)
