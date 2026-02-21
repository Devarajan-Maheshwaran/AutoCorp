# Master Agent Output Specification

This document explains exactly how Master Agent (Founder) output is generated and consumed.

## Endpoint

`POST /founder/start`

Input:

```json
{
  "objective": "Run dal arbitrage with 30000 INR in 30 days and min 15 percent margin"
}
```

## Output Object

```json
{
  "mode": "RULE_BASED",
  "procurementFailCount": 0,
  "paused": false,
  "activePlan": {
    "objective": "...",
    "charter": { "...": "..." },
    "taskDag": ["..."],
    "agentAssignments": ["..."]
  },
  "businessAddress": "0x..."
}
```

## Generation Logic

### 1) Charter generation
File: `src/founder/founderService.ts`
- `buildCharter(objective)` extracts budget hints and applies scenario constraints.
- Constraints are fixed to dal, Jodhpur -> Mumbai, and policy defaults.

### 2) Task split generation
File: `src/founder/founderService.ts`
- `buildTaskDag()` creates deterministic dependency graph:
  - t1 price_monitor
  - t2 procurement (depends t1)
  - t3 logistics (depends t2)
  - t4 sales (depends t3)
  - t5 accountant (depends t2,t3,t4)

### 3) Agent assignment generation
File: `src/founder/founderService.ts`
- `buildAssignments()` maps capability -> DID -> wallet placeholders.

### 4) On-chain entity generation
File: `src/onchain/contracts.ts`
- `deployBusiness(charter)`:
  - If env/wallet/factory configured: sends real transaction.
  - Else: returns deterministic demo-safe generated address.

### 5) Stream output generation
Files: `src/founder/founderService.ts`, `src/eventBus.ts`
- Reasoning steps emitted to `reasoning` stream.
- Assignment and escalation messages emitted to `a2a` stream.
- Deployment event emitted to `ledger` stream.

## Escalation Output

`POST /founder/event` with `type=procurement_failed` increments fail counter.
At fail count >= 3:
- `paused` becomes true.
- escalation A2A message is emitted with action `pause_and_escalate_investor`.
