'use client'

import { useState, useEffect, useCallback } from 'react'
import { AGENT_ENDPOINTS } from '@/lib/constants'
import type { PnLState } from '@/lib/types'

const MASTER_AGENT_URL = AGENT_ENDPOINTS.masteragent

const initialPnL: PnLState = {
  total_invested: 0,
  total_spent: 0,
  total_revenue: 0,
  gross_profit: 0,
  roi_pct: 0,
  lots_purchased: 0,
  lots_sold: 0,
  open_trades: 0,
  last_updated: '',
}

export function usePnL(businessId: string | null) {
  const [pnl, setPnl] = useState<PnLState>(initialPnL)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPnL = useCallback(async () => {
    if (!businessId) return

    try {
      const res = await fetch(`${MASTER_AGENT_URL}/accountant/state`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      // Map from masteragent accountant schema to our PnLState
      const snapshot = data.accountant ?? data

      setPnl({
        total_invested: snapshot.totalInvested ?? snapshot.total_invested ?? 0,
        total_spent: snapshot.totalSpent ?? snapshot.total_spent ?? 0,
        total_revenue: snapshot.revenue ?? snapshot.total_revenue ?? 0,
        gross_profit: snapshot.grossProfit ?? snapshot.gross_profit ?? 0,
        roi_pct: snapshot.roiPct ?? snapshot.roi_pct ?? 0,
        lots_purchased: snapshot.lots_purchased ?? 0,
        lots_sold: snapshot.lots_sold ?? 0,
        open_trades: snapshot.open_trades ?? 0,
        last_updated: snapshot.last_updated ?? new Date().toISOString(),
      })
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch P&L')
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    fetchPnL()
    const interval = setInterval(fetchPnL, 15_000)
    return () => clearInterval(interval)
  }, [fetchPnL])

  return { pnl, loading, error, refetch: fetchPnL }
}
