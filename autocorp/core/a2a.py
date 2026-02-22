"""
Agent-to-Agent (A2A) protocol primitives.

Provides Pydantic models for agent discovery (AgentCard) and inter-agent
messaging (A2AMessage), plus the ``send_a2a`` helper that POSTs a message
to another agent's ``/tasks/send`` endpoint.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

import httpx
from pydantic import BaseModel, Field


class AgentCard(BaseModel):
    """Public metadata card describing an agent's identity and capabilities."""
    name: str
    description: str = ""
    url: str
    version: str = "2.0.0"
    capabilities: list[str] = []
    supported_categories: list[str] = []
    wallet_address: str = ""


class A2AMessage(BaseModel):
    """Envelope for every inter-agent task / signal."""
    task_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_agent: str
    to_agent: str
    capability: str
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: float = 0.0

    def model_post_init(self, _context: Any) -> None:
        if self.timestamp == 0.0:
            self.timestamp = time.time()


def new_task_id() -> str:
    return str(uuid.uuid4())


async def send_a2a(to_url: str, msg: A2AMessage) -> dict:
    """POST *msg* as JSON to ``{to_url}``."""
    endpoint = to_url if "/tasks/send" in to_url else f"{to_url.rstrip('/')}/tasks/send"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(endpoint, json=msg.model_dump())
        if resp.status_code >= 400:
            raise RuntimeError(
                f"A2A call to {endpoint} failed — HTTP {resp.status_code}: {resp.text}"
            )
        return resp.json()
    except httpx.ConnectError as exc:
        raise RuntimeError(f"Agent at {to_url} unreachable: {exc}") from exc
