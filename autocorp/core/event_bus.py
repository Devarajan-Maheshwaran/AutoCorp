"""
AutoCorp Event Bus — SSE event publisher.

Lightweight async pub-sub for streaming events to dashboard and between agents.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Callable

_listeners: dict[str, list[Callable]] = {}
_queues: dict[str, list[asyncio.Queue]] = {}


async def publish(event: dict[str, Any]) -> None:
    """Publish an event to all subscribers of the agent's channel."""
    agent = event.get("agent", "system")
    channel = f"{agent}_events"

    # Notify function-based listeners
    for fn in _listeners.get(channel, []):
        try:
            if asyncio.iscoroutinefunction(fn):
                await fn(event)
            else:
                fn(event)
        except Exception:
            pass

    # Notify queue-based listeners
    for q in _queues.get(channel, []):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass

    # Also publish to global channel
    for q in _queues.get("global_events", []):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass


async def subscribe(channel: str) -> asyncio.Queue:
    """Subscribe to a channel. Returns an asyncio.Queue that receives events."""
    q: asyncio.Queue = asyncio.Queue(maxsize=500)
    _queues.setdefault(channel, []).append(q)
    return q


def on(channel: str, callback: Callable) -> Callable:
    """Register a function-based listener. Returns an unsubscribe callable."""
    _listeners.setdefault(channel, []).append(callback)
    return lambda: _listeners[channel].remove(callback)


async def subscribe_global() -> asyncio.Queue:
    """Subscribe to ALL events across all agents."""
    return await subscribe("global_events")
