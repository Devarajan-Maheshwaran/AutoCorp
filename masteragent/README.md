# AutoCorp MasterAgent (v2 — Multi-Category Profit Engine)

Orchestration server for the AutoCorp autonomous profit engine. Creates, monitors, and dissolves businesses across multiple asset categories.

## Supported Categories

| ID | Category | Assets |
|----|----------|--------|
| `1_crypto` | Crypto Arbitrage | Cross-exchange, funding rate, triangular |
| `2_compute` | Compute/GPU Arbitrage | GPU spot pricing, API credits |
| `5_saas` | SaaS Licence Arbitrage | Licence resale, domain flipping |

## Quick Start

```bash
npm install
copy .env.example .env   # fill in SEPOLIA_RPC_URL, GEMINI_API_KEY
npm run dev
```

Server starts at `http://localhost:8787`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/business/create` | Create business `{objective, category}` |
| `GET` | `/business/:id/status` | Business status + charter |
| `POST` | `/business/:id/dissolve` | Dissolve a business |
| `GET` | `/businesses` | List all businesses |
| `GET` | `/categories` | List supported categories |
| `POST` | `/events` | Ingest agent events |
| `POST` | `/accountant/event` | Ingest purchase/sale/transport events |
| `GET` | `/state` | Full state snapshot |
| `GET` | `/stream/reasoning` | SSE — live reasoning stream |
| `GET` | `/stream/pnl` | SSE — P&L updates |
| `GET` | `/stream/a2a` | SSE — A2A messages |
| `GET` | `/stream/ledger` | SSE — transaction feed |

## Architecture

- **Founder Service** — calls charter server (:8009), dispatches charters to Python agents
- **Accountant Service** — tracks P&L by category, USD-denominated
- **Onchain** — Ethereum Sepolia contract stubs for escrow/P&L

## Related Services

- Charter generator: `autocorp/core/charter_server.py` (port 8009)
- Python agents: `autocorp/servers/` (ports 8002–8006)
- Digital delivery: `logistics-agent/` (port 3002)
- Mock data: `mock-apis/` (port 3001)
- Dashboard: `dashboard/` (port 3000)
