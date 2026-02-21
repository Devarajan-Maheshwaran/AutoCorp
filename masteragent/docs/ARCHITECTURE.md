# MasterAgent Architecture

This folder contains Member-1 implementation for AutoCorp:
- Founder Agent (Master Agent)
- Accountant Agent
- Streaming outputs for Glassbox panels

## Runtime Flow

1. Investor objective hits `POST /founder/start`.
2. Founder generates charter + task DAG + assignments.
3. Founder triggers on-chain deployment via `OnchainAdapter.deployBusiness`.
4. Founder emits A2A assignment messages to specialist agents.
5. Specialist or simulated events are ingested through `POST /accountant/event`.
6. Accountant computes deterministic running P&L and emits SSE updates.

## SSE Streams

- `/stream/reasoning`: Thought-Action-Observation packets.
- `/stream/a2a`: Agent task and escalation messages.
- `/stream/ledger`: normalized transaction-like events with optional tx links.
- `/stream/pnl`: real-time P&L snapshots.

## Reliability Choice

Founder runs in `RULE_BASED` mode by default for hackathon stability. This ensures the orchestration graph is always produced even without LLM API keys.

## Integration Points

- Replace placeholders in `src/onchain/contracts.ts` with real deployed contract addresses and ABI.
- Connect Member-2 agents to emit real A2A and accounting events.
- Connect Member-4 dashboard to SSE endpoints for 5-panel Glassbox rendering.
