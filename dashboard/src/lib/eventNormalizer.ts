/**
 * Event Normalizer — converts raw SSE payloads from different agent servers
 * into a standardized AgentEvent shape for the dashboard.
 */

import type { AgentEvent, EventType } from '@/lib/types'

const KNOWN_TYPES: Set<string> = new Set([
  'price_tick', 'mumbai_price_tick', 'react_step', 'onchain_event',
  'a2a_sent', 'a2a_received', 'sale_completed', 'delivery_confirmed',
  'transit_update', 'trade_aborted', 'error',
])

function toEventType(raw: unknown): EventType {
  const s = typeof raw === 'string' ? raw : ''
  // Alias mapping for variant names
  if (s === 'price_update') return 'price_tick'
  if (s === 'trade_completed') return 'sale_completed'
  return (KNOWN_TYPES.has(s) ? s : 'error') as EventType
}

/**
 * Normalize a raw SSE event from any agent into the standard AgentEvent format.
 */
export function normalizeEvent(raw: Record<string, unknown>, sourceAgent?: string): AgentEvent {
  const eventType = toEventType(raw.type)

  const event: AgentEvent = {
    agent: (raw.agent as string) || sourceAgent || 'system',
    type: eventType,
    ts: (raw.ts as number) || Date.now() / 1000,
    simulated: (raw.simulated as boolean) ?? undefined,
    payload: raw,
  }

  // Price tick normalization
  if (eventType === 'price_tick') {
    event.price = (raw.source_price ?? raw.buy_price ?? raw.price) as number | undefined
    event.source = raw.source as string | undefined
    event.asset = raw.asset as string | undefined
    event.payload = {
      ...raw,
      source_price: raw.source_price ?? raw.buy_price ?? raw.price,
      destination_price: raw.destination_price ?? raw.sell_price,
      spread_pct: raw.spread_pct ?? raw.margin_pct,
    }
  }

  // ReAct step normalization
  if (eventType === 'react_step') {
    event.thought = (raw.thought as string) ?? ''
    event.action = (raw.action as string) ?? ''
    event.observation = (raw.observation as string) ?? ''
  }

  // On-chain event normalization
  if (eventType === 'onchain_event' || (raw.etherscan as string)) {
    event.event = raw.event as string | undefined
    event.etherscan = (raw.etherscan ?? raw.tx_url ?? raw.txUrl) as string | undefined
    event.lot_id = raw.lot_id as string | undefined
    event.simulated = (raw.simulated as boolean) ?? true
  }

  // A2A message normalization
  if (eventType === 'a2a_sent' || eventType === 'a2a_received') {
    event.to = (raw.to_agent ?? raw.to) as string | undefined
    event.capability = raw.capability as string | undefined
  }

  // Sale event normalization
  if (eventType === 'sale_completed') {
    event.lot_id = (raw.lot_id ?? raw.trade_id) as string | undefined
    event.payload = {
      ...raw,
      net_profit_usdc: raw.net_profit_usdc ?? raw.net_profit ?? 0,
    }
  }

  return event
}

/**
 * Determine the CSS color class for an event type.
 */
export function eventColor(type: string): string {
  switch (type) {
    case 'price_tick':      return 'text-blue-400'
    case 'react_step':      return 'text-purple-400'
    case 'onchain_event':   return 'text-emerald-400'
    case 'a2a_sent':        return 'text-yellow-400'
    case 'a2a_received':    return 'text-yellow-300'
    case 'sale_completed':  return 'text-green-400'
    case 'trade_aborted':   return 'text-red-400'
    case 'error':           return 'text-red-500'
    default:                return 'text-gray-400'
  }
}

/**
 * Human-readable label for an event type.
 */
export function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    price_tick:         'Price Update',
    mumbai_price_tick:  'Mumbai Price',
    react_step:         'Agent Thought',
    onchain_event:      'On-Chain',
    a2a_sent:           'A2A Message',
    a2a_received:       'A2A Received',
    sale_completed:     'Sale',
    delivery_confirmed: 'Delivered',
    transit_update:     'In Transit',
    trade_aborted:      'Trade Aborted',
    error:              'Error',
  }
  return labels[type] || type
}
