# AutoCorp Member-1 Demo Runbook (5 Minutes)

## 1) Start backend

```bash
npm install
npm run dev
```

Server: `http://localhost:8787`

## 2) Open Glassbox streams (4 tabs)

- Reasoning: `http://localhost:8787/stream/reasoning`
- A2A: `http://localhost:8787/stream/a2a`
- Ledger: `http://localhost:8787/stream/ledger`
- PnL: `http://localhost:8787/stream/pnl`

## 3) Kick Founder orchestration

```bash
curl -X POST http://localhost:8787/founder/start ^
  -H "Content-Type: application/json" ^
  -d "{\"objective\":\"Run dal arbitrage with 30k in 30 days and min 15% margin\"}"
```

Expected:
- founder state shows `mode: RULE_BASED`
- task DAG + assignments created
- deploy event appears in ledger stream
- assignment messages appear in A2A stream

## 4) Show live P&L quickly

```bash
curl -X POST http://localhost:8787/demo/seed
```

Expected P&L style numbers:
- Total Invested around 30000
- Procurement/Transport/Fee costs populated
- Revenue populated
- Gross profit + ROI visible in stream

## 5) Show escalation logic (non-obvious control)

Call 3 times:

```bash
curl -X POST http://localhost:8787/founder/event ^
  -H "Content-Type: application/json" ^
  -d "{\"type\":\"procurement_failed\",\"reason\":\"[SIMULATED] mandi closed\"}"
```

Expected:
- after third call founder `paused: true`
- escalation A2A message emitted to investor DID

## 6) State snapshot for judges

```bash
curl http://localhost:8787/state
```

Use this output to summarize:
- charter active
- orchestration mode
- fail-safe policy
- live P&L and escrow

## Notes

- Mark payment and logistics UI labels as `[SIMULATED]`.
- Replace on-chain placeholders once Member-3 shares deployed addresses/ABI.
- Keep this deterministic flow as fallback even if LLM integration is added.
