# Per-Agent Output Reference

## Founder Agent (Member 1)

Primary output:
- Charter JSON
- Task DAG
- Agent assignments
- Business deployment metadata

Stream outputs:
- reasoning events (`Thought -> Action -> Observation`)
- A2A assignment and escalation messages
- deploy ledger event

## Accountant Agent (Member 1)

Input source:
- normalized events through `POST /accountant/event`

Primary output:
- P&L snapshot:
  - totalInvested
  - totalSpent
  - procurement
  - transport
  - fees
  - revenue
  - grossProfit
  - roiPct
  - projected30DayPct
  - escrowRemaining
  - agentPerformance metrics

Stream outputs:
- ledger event for each ingest event
- pnl stream update after each ingest

## Price Monitor Agent (Member 2 - expected integration)

Expected output to Founder/Procurement:
- trigger/wait decisions
- buy signal payload `{price, qtyRecommendation, lotRef}`

## Procurement Agent (Member 2 - expected integration)

Expected output to Logistics/Founder/Accountant:
- purchase confirmation `{qty, price, lotId}`
- failure notifications with reason

## Sales Agent (Member 2 - expected integration)

Expected output to Founder/Accountant:
- sale confirmation `{qty, price, buyerId, settlementStatus}`

## Logistics Agent (Member 4 - expected integration)

Expected output to Sales/Founder/Accountant:
- booking confirmation `{trackingId, route, cost}`
- tracking milestones `[SIMULATED]`
- delivery confirmation
