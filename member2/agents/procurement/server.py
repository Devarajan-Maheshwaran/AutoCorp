"""
FastAPI server for the Procurement Agent.

- Runs on port 8003
- On startup: launches ProcurementAgent.run() as background task
- GET  /.well-known/agent.json  → A2A agent card
- POST /tasks/send              → receives A2A messages (buy_signal from Price Monitor)
- GET  /events                  → SSE stream for the dashboard
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

from member2.agents.procurement.agent import ProcurementAgent
from member2.shared.a2a import A2AMessage, AgentCard
from member2.shared.event_bus import event_stream, publish, subscribe, unsubscribe

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Procurement Agent")

_agent = ProcurementAgent()


# ── Lifecycle ──────────────────────────────────────────────────────────────


@app.on_event("startup")
async def _startup() -> None:
    asyncio.create_task(_agent.run())


# ── A2A discovery ─────────────────────────────────────────────────────────


@app.get("/.well-known/agent.json")
async def agent_card() -> dict:
    card = AgentCard(
        name="Procurement Agent",
        description=(
            "Validates buy signals, verifies escrow balance, "
            "places eNAM orders, records on Sepolia."
        ),
        url="http://localhost:8003",
        capabilities=["procurement"],
    )
    return card.model_dump()


# ── A2A inbound ───────────────────────────────────────────────────────────


@app.post("/tasks/send")
async def tasks_send(msg: A2AMessage) -> dict:
    await publish({
        "agent": "procurement",
        "type": "a2a_received",
        "from_agent": msg.from_agent,
        "capability": msg.capability,
    })

    if msg.capability == "buy_signal":
        await _agent.receive_signal(msg.payload)

    return {"status": "ok", "agent": "procurement"}


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
        "agent": "procurement",
        "budget_remaining": _agent.budget_remaining(),
    }


# ── Direct run ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8003)
