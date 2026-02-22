import { AGENT_ENDPOINTS, CHAIN } from './constants'
import type { Business, Charter, PnLState, PopularityData, LiveActivity } from './types'

// ─── Business Creation ────────────────────────────────────────────
export async function createBusiness(params: {
  category: string
  sub_strategy: string
  budget_inr: number
  duration_days: number
  min_profit_pct: number
  risk_level: string
}): Promise<Business> {
  const res = await fetch(`${AGENT_ENDPOINTS.masteragent}/business/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`Failed to create business: ${res.status}`)
  return res.json()
}

// ─── Charter Generation Preview ──────────────────────────────────
export async function previewCharter(params: {
  category: string
  sub_strategy: string
  budget_inr: number
  duration_days: number
  min_profit_pct: number
  risk_level: string
}): Promise<Charter> {
  const res = await fetch(`${AGENT_ENDPOINTS.charter_gen}/generate-charter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error('Charter generation failed')
  return res.json()
}

// ─── Business Status ─────────────────────────────────────────────
export async function getBusinessStatus(businessId: string): Promise<{
  state: string; charter: Charter; pnl: PnLState
}> {
  const res = await fetch(
    `${AGENT_ENDPOINTS.masteragent}/business/${businessId}/status`
  )
  if (!res.ok) throw new Error('Failed to get business status')
  return res.json()
}

// ─── P&L ─────────────────────────────────────────────────────────
export async function getPnL(): Promise<PnLState> {
  try {
    const res = await fetch(`${AGENT_ENDPOINTS.masteragent}/accountant/state`)
    if (!res.ok) throw new Error('PnL fetch failed')
    return res.json()
  } catch {
    return {
      total_invested: 0, total_spent: 0, total_revenue: 0,
      gross_profit: 0, roi_pct: 0, lots_purchased: 0,
      lots_sold: 0, last_updated: new Date().toISOString(),
      open_trades: 0
    }
  }
}

// ─── Categories from Charter Generator ───────────────────────────
export async function getCategories() {
  const res = await fetch(`${AGENT_ENDPOINTS.charter_gen}/categories`)
  if (!res.ok) throw new Error('Failed to fetch categories')
  return res.json()
}

// ─── Popularity Data ─────────────────────────────────────────────
export async function getPopularityData(): Promise<PopularityData[]> {
  const res = await fetch(`${AGENT_ENDPOINTS.masteragent}/analytics/popularity`)
  if (!res.ok) throw new Error(`Popularity API failed: ${res.status}`)
  return res.json()
}

// ─── Live Activity Feed ──────────────────────────────────────────
export async function getLiveActivity(): Promise<LiveActivity[]> {
  const res = await fetch(`${AGENT_ENDPOINTS.masteragent}/analytics/activity`)
  if (!res.ok) throw new Error(`Activity API failed: ${res.status}`)
  return res.json()
}

// ─── Pipeline Trigger (demo button) ──────────────────────────────
export async function triggerPipeline(): Promise<{ status: string }> {
  const res = await fetch(`${AGENT_ENDPOINTS.masteragent}/founder/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  })
  return res.json()
}

// ─── Dissolve Business ────────────────────────────────────────────
export async function dissolveBusiness(businessId: string): Promise<{ status: string }> {
  const res = await fetch(
    `${AGENT_ENDPOINTS.masteragent}/business/${businessId}/dissolve`,
    { method: 'POST' }
  )
  return res.json()
}
