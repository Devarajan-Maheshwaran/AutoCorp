"""
AutoCorp Member 2 — End-to-end integration test.

Validates the complete pipeline: agent health → price feeds → buy signal
processing → delivery → sales. All three agents must be running first:
    python -m member2.main

Run this script from the AutoCorp/ directory:
    python -m member2.test_integration
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid

import httpx

from member2.shared.price_feed import MandiFeed

# ── Config ─────────────────────────────────────────────────────────────────

PRICE_MONITOR = "http://localhost:8002"
PROCUREMENT = "http://localhost:8003"
SALES = "http://localhost:8004"

passed = 0
failed = 0
onchain_events: list[dict] = []


def ok(label: str, detail: str = "") -> None:
    global passed
    passed += 1
    print(f"  ✅ PASS — {label}" + (f": {detail}" if detail else ""))


def fail(label: str, detail: str = "") -> None:
    global failed
    failed += 1
    print(f"  ❌ FAIL — {label}" + (f": {detail}" if detail else ""))


def warn(label: str, detail: str = "") -> None:
    print(f"  ⚠️  WARN — {label}" + (f": {detail}" if detail else ""))


# ── SSE helper ─────────────────────────────────────────────────────────────


async def collect_sse_events(
    url: str,
    timeout: float,
    stop_types: set[str] | None = None,
) -> list[dict]:
    """Subscribe to an SSE stream and collect events until *timeout* or *stop_types* seen."""
    events: list[dict] = []
    stop_types = stop_types or set()

    async with httpx.AsyncClient(timeout=None) as client:
        try:
            async with client.stream("GET", url) as resp:
                deadline = time.time() + timeout
                async for line in resp.aiter_lines():
                    if time.time() > deadline:
                        break
                    if not line.startswith("data:"):
                        continue
                    try:
                        evt = json.loads(line[5:].strip())
                        events.append(evt)
                        if evt.get("type") in stop_types:
                            break
                    except json.JSONDecodeError:
                        continue
        except (httpx.ReadTimeout, httpx.RemoteProtocolError):
            pass

    return events


# ── STEP 1: Agent health / discovery ──────────────────────────────────────


async def step1_health(client: httpx.AsyncClient) -> None:
    print("\n═══ STEP 1 — Agent Health Checks ═══")
    agents = [
        (PRICE_MONITOR, "price_monitoring"),
        (PROCUREMENT, "procurement"),
        (SALES, "sales"),
    ]
    for base, cap in agents:
        url = f"{base}/.well-known/agent.json"
        try:
            resp = await client.get(url)
            if resp.status_code != 200:
                fail(f"{url}", f"HTTP {resp.status_code}")
                continue
            data = resp.json()
            caps = data.get("capabilities", [])
            if cap in caps:
                ok(f"{data.get('name', '?')}", f"capabilities={caps}")
            else:
                fail(f"{url}", f"'{cap}' not in {caps}")
        except Exception as exc:
            fail(f"{url}", str(exc))


# ── STEP 2: Live price feed ──────────────────────────────────────────────


async def step2_price_feeds() -> None:
    print("\n═══ STEP 2 — Live Price Feed Validation ═══")

    jodhpur_price = 0.0
    mumbai_price = 0.0

    # Jodhpur
    try:
        j = await MandiFeed.get_latest_price("Jodhpur", "Moong Dal")
        jodhpur_price = j["modal_price"]
        date_j = j["arrival_date"]
        if isinstance(jodhpur_price, float) and 40.0 <= jodhpur_price <= 250.0:
            ok("Jodhpur Moong Dal", f"₹{jodhpur_price}/kg as of {date_j}")
        else:
            fail("Jodhpur price out of sane range", f"₹{jodhpur_price}/kg")
        if not date_j:
            fail("Jodhpur arrival_date is empty")
    except Exception as exc:
        fail("Jodhpur price feed", str(exc))

    # Mumbai
    try:
        m = await MandiFeed.get_latest_price_mumbai("Moong Dal")
        mumbai_price = m["modal_price"]
        date_m = m["arrival_date"]
        if isinstance(mumbai_price, float) and 40.0 <= mumbai_price <= 250.0:
            ok("Mumbai Moong Dal", f"₹{mumbai_price}/kg as of {date_m}")
        else:
            fail("Mumbai price out of sane range", f"₹{mumbai_price}/kg")
    except Exception as exc:
        fail("Mumbai price feed", str(exc))

    # Arbitrage premise check
    if jodhpur_price and mumbai_price:
        if mumbai_price > jodhpur_price:
            ok(
                "Arbitrage premise",
                f"Mumbai ₹{mumbai_price} > Jodhpur ₹{jodhpur_price}",
            )
        else:
            warn(
                "Arbitrage spread inverted today",
                f"Mumbai ₹{mumbai_price} ≤ Jodhpur ₹{jodhpur_price}. "
                "This is valid — the market isn't always favorable. "
                "The Sales Agent will handle cut-loss scenarios.",
            )


# ── STEP 3: Buy signal → Procurement ─────────────────────────────────────


async def step3_procurement(client: httpx.AsyncClient) -> None:
    print("\n═══ STEP 3 — Buy Signal → Procurement Pipeline ═══")

    lot_id = "TEST-LOT-001"

    # Start SSE listener in background
    sse_task = asyncio.create_task(
        collect_sse_events(
            f"{PROCUREMENT}/events",
            timeout=30,
            stop_types={"a2a_sent", "rejected"},
        )
    )

    # Small delay to let SSE connection establish
    await asyncio.sleep(1)

    # POST buy_signal
    msg = {
        "task_id": str(uuid.uuid4()),
        "from_agent": "price_monitor",
        "to_agent": "procurement",
        "capability": "buy_signal",
        "payload": {
            "lot_id": lot_id,
            "price_per_kg": 75.0,
            "quantity_kg": 200,
            "mandi": "Jodhpur",
            "commodity": "Moong Dal",
            "quality_grade": "A",
        },
    }
    try:
        resp = await client.post(f"{PROCUREMENT}/tasks/send", json=msg)
        if resp.status_code == 200:
            ok("Buy signal POSTed", f"lot_id={lot_id}")
        else:
            fail("Buy signal POST", f"HTTP {resp.status_code}")
            return
    except Exception as exc:
        fail("Buy signal POST", str(exc))
        return

    # Wait for SSE events
    events = await sse_task

    # Check for react_step
    react_events = [
        e for e in events
        if e.get("agent") == "procurement" and e.get("type") == "react_step"
    ]
    if react_events:
        evt = react_events[0]
        ok(
            "Procurement ReAct reasoning",
            f"Action: {evt.get('action', '?')[:80]}",
        )
        thought = evt.get("thought", "")
        if thought:
            print(f"        Thought: {thought[:120]}...")
    else:
        fail("No react_step event from Procurement within 30s")

    # Check for a2a_sent (pickup_ready) or rejection
    a2a_events = [
        e for e in events
        if e.get("agent") == "procurement"
        and e.get("type") == "a2a_sent"
        and e.get("capability") == "pickup_ready"
    ]
    reject_events = [
        e for e in events
        if e.get("agent") == "procurement" and e.get("type") == "rejected"
    ]

    if a2a_events:
        ok("Procurement → Logistics A2A confirmed", f"lot_id={lot_id}")
    elif reject_events:
        reason = reject_events[0].get("action", "unknown")
        warn(f"Procurement REJECTED (valid behavior)", reason[:100])
    else:
        fail("No a2a_sent or rejection event from Procurement within 30s")

    # Collect on-chain events
    for e in events:
        if e.get("type") == "onchain_event":
            onchain_events.append(e)


# ── STEP 4: Delivery confirmation → Sales ─────────────────────────────────


async def step4_sales(client: httpx.AsyncClient) -> None:
    print("\n═══ STEP 4 — Delivery Confirmation → Sales Pipeline ═══")

    lot_id = "TEST-LOT-001"

    # Start SSE listener
    sse_task = asyncio.create_task(
        collect_sse_events(
            f"{SALES}/events",
            timeout=90,
            stop_types={"sale_completed", "rejected"},
        )
    )
    await asyncio.sleep(1)

    # POST delivery_confirmed
    msg = {
        "task_id": str(uuid.uuid4()),
        "from_agent": "logistics",
        "to_agent": "sales",
        "capability": "delivery_confirmed",
        "payload": {
            "lot_id": lot_id,
            "quantity_kg": 200,
            "price_per_kg": 75.0,
            "transport_cost_per_kg": 9.0,
            "delivery_location": "Mumbai",
        },
    }
    try:
        resp = await client.post(f"{SALES}/tasks/send", json=msg)
        if resp.status_code == 200:
            ok("Delivery confirmation POSTed", f"lot_id={lot_id}")
        else:
            fail("Delivery confirmation POST", f"HTTP {resp.status_code}")
            return
    except Exception as exc:
        fail("Delivery confirmation POST", str(exc))
        return

    # Wait for SSE events
    events = await sse_task

    # Check for sale_completed
    sale_events = [
        e for e in events
        if e.get("agent") == "sales" and e.get("type") == "sale_completed"
    ]
    if sale_events:
        s = sale_events[0]
        print(
            f"        sell_price: ₹{s.get('sell_price_per_kg', '?')}/kg\n"
            f"        gross_profit: ₹{s.get('gross_profit', '?')}\n"
            f"        margin_pct: {s.get('margin_pct', '?')}%\n"
            f"        holding_days_used: {s.get('holding_days_used', '?')}"
        )
        ok(
            "Sale completed",
            f"₹{s.get('sell_price_per_kg', '?')}/kg, "
            f"Gross profit: ₹{s.get('gross_profit', '?')}, "
            f"Margin: {s.get('margin_pct', '?')}%, "
            f"Holding days: {s.get('holding_days_used', '?')}",
        )
        gp = s.get("gross_profit")
        if isinstance(gp, (int, float)):
            ok("gross_profit is numeric", str(gp))
        else:
            fail("gross_profit is not numeric", str(gp))

        tx = s.get("tx_hash")
        if tx:
            ok("On-chain tx captured", tx)
            onchain_events.append(s)
        else:
            warn("on-chain not configured — no tx_hash in sale event")
    else:
        # Check if react_step at least appeared
        react_events = [
            e for e in events
            if e.get("agent") == "sales" and e.get("type") == "react_step"
        ]
        if react_events:
            warn(
                "Sales ReAct ran but no sale_completed event within 90s",
                f"Action: {react_events[0].get('action', '?')[:80]}",
            )
        else:
            fail(
                "No sale_completed or react_step from Sales within 90s "
                "(is the Sales agent fully implemented?)"
            )


# ── STEP 5: Etherscan link format ─────────────────────────────────────────


async def step5_etherscan() -> None:
    print("\n═══ STEP 5 — Etherscan Link Format Check ═══")

    if not onchain_events:
        print("  ⚠️  Contract not configured — skipping Etherscan check")
        return

    for evt in onchain_events:
        link = evt.get("etherscan", "")
        if link.startswith("https://sepolia.etherscan.io/tx/0x"):
            ok("Etherscan link valid", link)
        else:
            fail("Etherscan link format invalid", link)


# ── Runner ─────────────────────────────────────────────────────────────────


async def run_all() -> None:
    print("╔══════════════════════════════════════════════════════╗")
    print("║  AutoCorp Member 2 — Integration Test Suite         ║")
    print("╚══════════════════════════════════════════════════════╝")

    async with httpx.AsyncClient(timeout=15.0) as client:
        await step1_health(client)
        await step2_price_feeds()
        await step3_procurement(client)
        await step4_sales(client)
        await step5_etherscan()

    print("\n══════════════════════════════════════════════════════")
    print(f"  Results: {passed} passed, {failed} failed")
    if failed == 0:
        print("  ✅ ALL TESTS PASSED — Member 2 ready for integration")
    else:
        print("  ❌ SOME TESTS FAILED — fix before handoff")
    print("══════════════════════════════════════════════════════")


if __name__ == "__main__":
    asyncio.run(run_all())
