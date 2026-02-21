# AutoCorp Member-1 Prototype (24h Hackathon)

This prototype implements **Founder Agent + Accountant Agent** with:
- strict JSON schemas
- orchestration DAG generation
- SSE Glassbox streams (`Thought -> Action -> Observation`)
- deterministic real-time P&L engine
- Polygon Amoy contract-call stubs with tx-link generation

## Reliability Mode (Best for 24h Hackathon)

- Founder task splitting runs in `RULE_BASED` mode by default for maximum reliability.
- No LLM/API key is required for orchestration to work end-to-end.
- You can later layer LLM reasoning text, but demo-critical flow remains deterministic.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create env:
   ```bash
   copy .env.example .env
   ```
3. Run dev server:
   ```bash
   npm run dev
   ```

Server starts at `http://localhost:8787`.

## Demo Endpoints

- `POST /founder/start` — create charter + DAG + optional deploy call
- `POST /founder/event` — feed lifecycle status (e.g., procurement failure)
- `POST /accountant/event` — ingest normalized on-chain-like event
- `POST /demo/seed` — inject one complete simulated trade cycle for quick demo
- `GET /state` — snapshot of founder + accountant state
- `GET /stream/reasoning` — live reasoning stream for Panel 1
- `GET /stream/pnl` — live P&L stream for Panel 5
- `GET /stream/a2a` — A2A message stream for Panel 3
- `GET /stream/ledger` — transaction feed stream for Panel 4

## Hackathon Notes

- Keep payment/logistics as `[SIMULATED]` in frontend labels.
- Replace ABI placeholders in `src/onchain/contracts.ts` once Member-3 shares deployed contracts.
- For demo reliability, use local replay dataset for price/sale events and pass them through `/accountant/event`.

## Documentation Index

- Architecture: `docs/ARCHITECTURE.md`
- Master Agent output generation: `docs/MASTERAGENT_OUTPUT_SPEC.md`
- Per-agent outputs (produced/expected): `docs/AGENT_OUTPUTS.md`
- File-by-file code map: `docs/CODE_MAP.md`
