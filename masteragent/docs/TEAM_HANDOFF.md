# Team Handoff Contract (Member 1 Integration)

This document is the canonical contract your teammates can use to connect to MasterAgent without ambiguity.

## 1) Register Agent Cards (all specialists)

Endpoint:
- `POST /a2a/agent-card`

Payload:

```json
{
  "did": "did:autocorp:pricemon",
  "wallet": "0x1111111111111111111111111111111111111111",
  "capabilities": ["price_monitoring"],
  "endpoint": "http://localhost:9002"
}
```

Capabilities expected by Founder:
- `business_orchestration`
- `price_monitoring`
- `procurement`
- `logistics`
- `sales`
- `accounting`

Founder selects highest reputation per capability when AgentRegistry is configured.

## 2) Test Founder LLM plan generation only

Endpoint:
- `POST /founder/test-llm`

Payload:

```json
{ "objective": "Run dal arbitrage with 30000 INR in 30 days and min 15 percent margin" }
```

Response:
- `mode`: `OPENROUTER` or `RULE_BASED`
- `plan`: schema-validated founder plan
- `fallbackReason`: populated when fallback occurred

## 3) Start orchestration

Endpoint:
- `POST /founder/start`

Effect:
- plan generated
- business deployment triggered
- assignment A2A messages emitted

## 4) Specialist events to Accountant

Endpoint:
- `POST /accountant/event`

Payload examples:

```json
{
  "type": "purchase",
  "amountInr": 15600,
  "qtyKg": 200,
  "agent": "procurement",
  "txHash": "0x...",
  "meta": { "lotId": "LOT-001", "pricePerKg": 78 }
}
```

```json
{
  "type": "transport",
  "amountInr": 1800,
  "qtyKg": 200,
  "agent": "logistics",
  "txHash": "0x...",
  "meta": { "trackingId": "TRK-001", "route": "Jodhpur>Jaipur>Ahmedabad>Mumbai", "simulated": true }
}
```

```json
{
  "type": "sale",
  "amountInr": 19000,
  "qtyKg": 200,
  "agent": "sales",
  "txHash": "0x...",
  "meta": { "buyerId": "BUYER-MUM-14", "settlement": "[SIMULATED]" }
}
```

## 5) Realtime streams for UI

- `/stream/reasoning`
- `/stream/a2a`
- `/stream/ledger`
- `/stream/pnl`

These map directly to Glassbox Panels 1/3/4/5.
