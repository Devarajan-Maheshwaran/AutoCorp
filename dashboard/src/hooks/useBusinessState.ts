'use client'

import { useState, useEffect, useCallback } from 'react'
import { AGENT_ENDPOINTS } from '@/lib/constants'
import type { Charter, PnLState } from '@/lib/types'

const MASTER_AGENT_URL = AGENT_ENDPOINTS.masteragent

interface BusinessState {
  charter: Charter | null
  pnl: PnLState | null
  status: 'idle' | 'loading' | 'active' | 'dissolved' | 'error'
  contractAddress: string | null
  error: string | null
}

const initialState: BusinessState = {
  charter: null,
  pnl: null,
  status: 'idle',
  contractAddress: null,
  error: null,
}

export function useBusinessState(businessId: string | null) {
  const [state, setState] = useState<BusinessState>(initialState)

  const fetchStatus = useCallback(async () => {
    if (!businessId) return

    setState(prev => ({ ...prev, status: 'loading' }))

    try {
      const res = await fetch(`${MASTER_AGENT_URL}/business/${businessId}/status`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      setState({
        charter: data.charter ?? data.state?.activePlan?.charter ?? null,
        pnl: data.pnl ?? null,
        status: data.state?.paused ? 'dissolved' : 'active',
        contractAddress: data.state?.businessAddress ?? null,
        error: null,
      })
    } catch (err: unknown) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }, [businessId])

  // Poll every 30s
  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30_000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const dissolve = useCallback(async () => {
    if (!businessId) return
    try {
      await fetch(`${MASTER_AGENT_URL}/business/${businessId}/dissolve`, {
        method: 'POST',
      })
      setState(prev => ({ ...prev, status: 'dissolved' }))
    } catch (err: unknown) {
      console.error('Dissolve failed:', err)
    }
  }, [businessId])

  return { ...state, dissolve, refetch: fetchStatus }
}
