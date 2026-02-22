'use client'
import { useEffect, useReducer, useRef, useCallback } from 'react'
import { AGENT_NODES } from '@/lib/constants'
import type { AgentEvent, PnLState } from '@/lib/types'

interface SSEState {
  events:         AgentEvent[]
  priceTicks:     { source: { ts: number; price: number }[];
                    destination: { ts: number; price: number }[] }
  reactSteps:     AgentEvent[]
  onchainEvents:  AgentEvent[]
  a2aEvents:      AgentEvent[]
  saleResults:    AgentEvent[]
  agentStatus:    Record<string, 'connected' | 'disconnected'>
  pnl:            PnLState
}

const initialState: SSEState = {
  events:        [],
  priceTicks:    { source: [], destination: [] },
  reactSteps:    [],
  onchainEvents: [],
  a2aEvents:     [],
  saleResults:   [],
  agentStatus:   Object.fromEntries(
    AGENT_NODES.map(n => [n.id, 'disconnected'])
  ),
  pnl: {
    total_invested: 0, total_spent: 0, total_revenue: 0,
    gross_profit: 0, roi_pct: 0, lots_purchased: 0,
    lots_sold: 0, last_updated: '', open_trades: 0
  }
}

type Action =
  | { type: 'ADD_EVENT';         event: AgentEvent }
  | { type: 'AGENT_CONNECTED';   agent: string }
  | { type: 'AGENT_DISCONNECTED'; agent: string }
  | { type: 'UPDATE_PNL';        pnl: PnLState }

function reducer(state: SSEState, action: Action): SSEState {
  switch (action.type) {
    case 'ADD_EVENT': {
      const ev = action.event
      const newEvents = [ev, ...state.events].slice(0, 200)

      // Route to specific buckets by event type
      if (ev.type === 'price_tick') {
        return {
          ...state, events: newEvents,
          priceTicks: {
            ...state.priceTicks,
            source: [
              ...state.priceTicks.source,
              { ts: ev.ts, price: ev.price! }
            ].slice(-50)
          }
        }
      }
      if (ev.type === 'mumbai_price_tick') {
        return {
          ...state, events: newEvents,
          priceTicks: {
            ...state.priceTicks,
            destination: [
              ...state.priceTicks.destination,
              { ts: ev.ts, price: ev.price! }
            ].slice(-50)
          }
        }
      }
      if (ev.type === 'react_step') {
        return {
          ...state, events: newEvents,
          reactSteps: [ev, ...state.reactSteps].slice(0, 50)
        }
      }
      if (ev.type === 'onchain_event') {
        const newPnl = { ...state.pnl }
        if (ev.event === 'PurchaseRecorded' || ev.event === 'TradeOpened') {
          newPnl.total_spent += (ev.payload?.costUsdc as number || 0) / 1e6
          newPnl.lots_purchased += 1
          newPnl.open_trades += 1
        }
        if (ev.event === 'SaleRecorded' || ev.event === 'TradeClosed') {
          newPnl.total_revenue += (ev.payload?.revenueUsdc as number || 0) / 1e6
          newPnl.lots_sold += 1
          newPnl.open_trades = Math.max(0, newPnl.open_trades - 1)
          newPnl.gross_profit = newPnl.total_revenue - newPnl.total_spent
          newPnl.roi_pct = newPnl.total_spent > 0
            ? (newPnl.gross_profit / newPnl.total_spent) * 100
            : 0
        }
        return {
          ...state, events: newEvents,
          onchainEvents: [ev, ...state.onchainEvents].slice(0, 100),
          pnl: newPnl
        }
      }
      if (ev.type === 'a2a_sent') {
        return {
          ...state, events: newEvents,
          a2aEvents: [ev, ...state.a2aEvents].slice(0, 100)
        }
      }
      if (ev.type === 'sale_completed') {
        return {
          ...state, events: newEvents,
          saleResults: [ev, ...state.saleResults].slice(0, 50)
        }
      }
      return { ...state, events: newEvents }
    }
    case 'AGENT_CONNECTED':
      return {
        ...state,
        agentStatus: { ...state.agentStatus, [action.agent]: 'connected' }
      }
    case 'AGENT_DISCONNECTED':
      return {
        ...state,
        agentStatus: { ...state.agentStatus, [action.agent]: 'disconnected' }
      }
    case 'UPDATE_PNL':
      return { ...state, pnl: action.pnl }
    default:
      return state
  }
}

export function useAgentSSE() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const sourcesRef = useRef<EventSource[]>([])

  useEffect(() => {
    // Close existing connections
    sourcesRef.current.forEach(es => es.close())
    sourcesRef.current = []

    const streams = [
      { url: 'http://localhost:8787/events', agent: 'founder' },
      { url: 'http://localhost:8002/events', agent: 'price_monitor' },
      { url: 'http://localhost:8003/events', agent: 'procurement' },
      { url: 'http://localhost:8004/events', agent: 'sales' },
      { url: 'http://localhost:3002/events', agent: 'logistics' },
      { url: 'http://localhost:8006/events', agent: 'accountant' },
    ]

    streams.forEach(({ url, agent }) => {
      try {
        const es = new EventSource(url)

        es.onopen = () => {
          dispatch({ type: 'AGENT_CONNECTED', agent })
        }

        es.onmessage = (e: MessageEvent) => {
          try {
            const raw = JSON.parse(e.data)
            // Normalize to common AgentEvent shape
            const normalized: AgentEvent = {
              agent:     raw.agent || agent,
              type:      raw.type  || 'unknown',
              thought:   raw.thought || null,
              action:    raw.action  || null,
              price:     raw.price   || raw.modal_price || null,
              source:    raw.source  || raw.exchange    || null,
              asset:     raw.asset   || raw.commodity   || null,
              unit:      raw.unit    || raw.price_unit  || null,
              exchange:  raw.exchange || null,
              event:     raw.event   || null,
              etherscan: raw.etherscan || null,
              lot_id:    raw.lot_id   || raw.trade_id   || null,
              to:        raw.to       || raw.payload?.to || null,
              capability: raw.capability || raw.payload?.capability || null,
              observation: raw.observation || null,
              payload:   raw,
              ts:        raw.ts || Date.now() / 1000,
              simulated: raw.simulated || raw.payload?.simulated || false,
            }
            dispatch({ type: 'ADD_EVENT', event: normalized })
          } catch {}
        }

        es.onerror = () => {
          dispatch({ type: 'AGENT_DISCONNECTED', agent })
          es.close()
        }

        sourcesRef.current.push(es)
      } catch {}
    })

    return () => {
      sourcesRef.current.forEach(es => es.close())
    }
  }, [])

  return state
}
