"""
AutoCorp v2.0 — Main entry point.
Starts all Python agent servers and the charter generator.

Usage:
    python main.py

This will start:
    - Charter Generator  (port 8009)
    - Price Monitor       (port 8002)
    - Procurement         (port 8003)
    - Sales               (port 8004)
    - Logistics Relay     (port 8005)
    - Accountant          (port 8006)

Node services must be started separately:
    cd logistics-agent && node server.js    (port 3002)
    cd masteragent && npm run dev           (port 8787)
    cd dashboard && npm run dev             (port 3000)
"""

import subprocess
import sys
import time
import os
from dotenv import load_dotenv

load_dotenv()

SERVICES = [
    ("CharterGen",     "python -m uvicorn autocorp.core.charter_server:app --port 8009"),
    ("PriceMonitor",   "python -m uvicorn autocorp.agents.price_monitor.server:app --port 8002"),
    ("Procurement",    "python -m uvicorn autocorp.agents.procurement.server:app --port 8003"),
    ("Sales",          "python -m uvicorn autocorp.agents.sales.server:app --port 8004"),
    ("LogisticsRelay", "python -m uvicorn autocorp.agents.logistics.server:app --port 8005"),
    ("Accountant",     "python -m uvicorn autocorp.agents.accountant.server:app --port 8006"),
]

procs = []


def main():
    print("=" * 60)
    print("  AutoCorp Autonomous Profit Engine v2.0.0")
    print("=" * 60)
    print()

    for name, cmd in SERVICES:
        p = subprocess.Popen(cmd, shell=True)
        procs.append((name, p))
        print(f"  [main.py] Started {name} (PID {p.pid})")
        time.sleep(0.5)

    print()
    print("  All Python agents running.")
    print()
    print("  Start Node services manually:")
    print("    cd logistics-agent && node server.js")
    print("    cd masteragent && npm run dev")
    print("    cd dashboard && npm run dev")
    print()
    print("=" * 60)

    try:
        for name, p in procs:
            p.wait()
    except KeyboardInterrupt:
        print("\n[main.py] Shutting down...")
        for name, p in procs:
            p.terminate()
        sys.exit(0)


if __name__ == "__main__":
    main()
