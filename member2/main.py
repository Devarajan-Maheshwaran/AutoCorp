"""
AutoCorp — Member 2 Market Agents entry point.

Runs preflight checks (data.gov.in API, Sepolia RPC, Gemini key) then
launches all three agent servers as uvicorn subprocesses on ports 8002–8004.
"""

from __future__ import annotations

import asyncio
import subprocess
import sys

from member2.shared.blockchain import w3
from member2.shared.config import CHARTER, GEMINI_API_KEY, RPC_URL
from member2.shared.price_feed import MandiFeed


# ── Preflight ──────────────────────────────────────────────────────────────


async def preflight_check() -> bool:
    """Verify external dependencies before launching agents."""
    print("Running preflight checks...\n")
    ok = True

    # 1 — Jodhpur price feed (hard requirement)
    try:
        result = await MandiFeed.get_latest_price("Jodhpur", "Moong Dal")
        print(
            f"  ✅ Jodhpur price feed: ₹{result['modal_price']}/kg "
            f"as of {result['arrival_date']}"
        )
    except Exception as exc:
        print(f"  ❌ data.gov.in API unreachable: {exc}")
        ok = False

    # 2 — Mumbai price feed (soft — warn only)
    try:
        result = await MandiFeed.get_latest_price_mumbai("Moong Dal")
        print(
            f"  ✅ Mumbai price feed: ₹{result['modal_price']}/kg "
            f"as of {result['arrival_date']}"
        )
    except Exception as exc:
        print(
            f"  ⚠️  Mumbai price feed failed — "
            f"Sales Agent will use fallback estimate ({exc})"
        )

    # 3 — Sepolia RPC (soft — warn only)
    if w3.is_connected():
        print(f"  ✅ Sepolia RPC connected: {RPC_URL}")
    else:
        print("  ⚠️  Sepolia RPC not reachable — on-chain calls will be skipped")

    # 4 — Gemini API key (hard requirement)
    if not GEMINI_API_KEY:
        print("  ❌ GEMINI_API_KEY not set in .env")
        ok = False
    else:
        print("  ✅ Gemini API key configured")

    print()
    return ok


# ── Main ───────────────────────────────────────────────────────────────────

AGENTS = [
    ("member2.agents.price_monitor.server:app", 8002),
    ("member2.agents.procurement.server:app", 8003),
    ("member2.agents.sales.server:app", 8004),
]

BANNER = """\
══════════════════════════════════════════════
  AutoCorp — Member 2 Market Agents
  Chain: Ethereum Sepolia (chainId 11155111)
══════════════════════════════════════════════
  Price Monitor  →  http://localhost:8002
  Procurement    →  http://localhost:8003
  Sales          →  http://localhost:8004

  Agent Cards (A2A discovery — for Member 1's Founder Agent):
    http://localhost:8002/.well-known/agent.json
    http://localhost:8003/.well-known/agent.json
    http://localhost:8004/.well-known/agent.json

  SSE Event Streams (for dashboard):
    http://localhost:8002/events
    http://localhost:8003/events
    http://localhost:8004/events

  Tell Member 4: POST delivery_confirmed to
    http://localhost:8004/tasks/send

  Tell Member 1: subscribe EventSource to /events
    on ports 8002, 8003, 8004
══════════════════════════════════════════════
"""


def main() -> None:
    # Preflight
    if not asyncio.run(preflight_check()):
        print("Fix errors above and restart.")
        sys.exit(1)

    # Launch uvicorn subprocesses
    procs: list[subprocess.Popen] = []
    for module, port in AGENTS:
        cmd = [
            sys.executable, "-m", "uvicorn", module,
            "--host", "0.0.0.0",
            "--port", str(port),
            "--log-level", "info",
        ]
        procs.append(subprocess.Popen(cmd))

    print(BANNER)

    # Wait / handle shutdown
    try:
        for p in procs:
            p.wait()
    except KeyboardInterrupt:
        print("\nShutting down agents...")
        for p in procs:
            p.terminate()
        for p in procs:
            p.wait()
        sys.exit(0)


if __name__ == "__main__":
    main()
