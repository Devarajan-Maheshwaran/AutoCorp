"""
In-process SSE event bus — the nervous system of the AutoCorp dashboard.

Every agent action (price tick, LLM reasoning step, A2A message, on-chain tx)
is ``publish()``-ed as a dict.  Dashboard clients call ``subscribe()`` to get
a personal ``asyncio.Queue`` and then iterate ``event_stream()`` to receive
``text/event-stream`` lines suitable for ``StreamingResponse``.

Standard event shape (all events **must** include ``agent`` and ``type``):
    { "agent": "price_monitor", "type": "price_tick", "ts": 1234567890.0, ... }
"""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator

# Module-level list of subscriber queues
_subscribers: list[asyncio.Queue] = []


def subscribe() -> asyncio.Queue:
    """
    Create a new subscriber queue and register it.

    ``maxsize=500`` prevents a slow dashboard client from back-pressuring
    the agent — events are silently dropped when the queue is full.
    """
    q: asyncio.Queue = asyncio.Queue(maxsize=500)
    _subscribers.append(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    """Remove a subscriber queue (e.g. when the client disconnects)."""
    try:
        _subscribers.remove(q)
    except ValueError:
        pass  # already removed


async def publish(event: dict) -> None:
    """
    Broadcast *event* to every subscriber.

    Sets ``event["ts"]`` to the current epoch time if not already present.
    If a subscriber queue is full the event is silently dropped — the agent
    must **never** block on a slow dashboard consumer.
    """
    event.setdefault("ts", time.time())

    for q in _subscribers:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass  # drop — slow consumer, never block the agent


async def event_stream(q: asyncio.Queue) -> AsyncIterator[str]:
    """
    Yield SSE-formatted lines from *q* forever.

    Wrap this with ``StreamingResponse(..., media_type="text/event-stream")``
    in your FastAPI ``/events`` endpoint.
    """
    try:
        while True:
            event: dict = await q.get()
            yield f"data: {json.dumps(event)}\n\n"
    except asyncio.CancelledError:
        pass
