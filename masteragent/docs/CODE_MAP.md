# Code Map (How It Works)

## Core Entry

- `src/server.ts`
  - Defines REST endpoints and SSE endpoints.
  - Wires Founder and Accountant services.

## Founder (Master Agent)

- `src/founder/founderService.ts`
  - `start(objective)` orchestrates full initialization.
  - `buildCharter` converts objective to structured charter.
  - `buildTaskDag` performs deterministic task splitting.
  - `buildAssignments` maps agent capabilities.
  - `onProcurementFailure` enforces fail-policy escalation.

## Accountant

- `src/accountant/accountantService.ts`
  - `ingest(event)` updates state and emits ledger/pnl streams.
  - `getSnapshot()` returns deterministic computed P&L.

## On-chain Adapter

- `src/onchain/contracts.ts`
  - `deployBusiness(charter)` bridges to AutoCorpFactory deployment or fallback demo address.

## Messaging

- `src/eventBus.ts`
  - lightweight pub-sub for `reasoning`, `a2a`, `ledger`, `pnl` channels.

## Shared Schemas

- `src/types.ts`
  - zod schemas for charter, tasks, events, and runtime payloads.

## Demo Seed

- `src/demoSeed.ts`
  - injects one complete simulated trade cycle for quick demos.
