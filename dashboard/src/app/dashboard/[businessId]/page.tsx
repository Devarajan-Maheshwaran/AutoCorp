'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ControlBar }    from '@/components/dashboard/ControlBar.tsx'
import { AgentBrain }    from '@/components/dashboard/AgentBrain.tsx'
import { PriceChart }    from '@/components/dashboard/PriceChart.tsx'
import { AgentNetwork }  from '@/components/dashboard/AgentNetwork.tsx'
import { OnChainLedger } from '@/components/dashboard/OnChainLedger.tsx'
import { PnLTracker }    from '@/components/dashboard/PnLTracker.tsx'
import { useAgentSSE }   from '@/hooks/useAgentSSE.ts'
import { useAgentHealth } from '@/hooks/useAgentHealth.ts'
import { getBusinessStatus } from '@/lib/api.ts'
import type { Charter, PnLState } from '@/lib/types'

export default function DashboardPage() {
  const params = useParams()
  const router = useRouter()
  const businessId = params.businessId as string

  const [charter,  setCharter]  = useState<Charter | null>(null)
  const [loading,  setLoading]  = useState(true)

  const sseState   = useAgentSSE()
  const agentHealth = useAgentHealth()

  // Override P&L from accountant API when available
  const [pnlOverride, setPnlOverride] = useState<PnLState | null>(null)
  const displayPnl = pnlOverride || sseState.pnl

  useEffect(() => {
    if (businessId && businessId !== 'demo') {
      getBusinessStatus(businessId)
        .then(s => { setCharter(s.charter); setLoading(false) })
        .catch(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [businessId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-gray-400 animate-pulse">Loading business...</div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white flex flex-col">
      <ControlBar
        charter={charter}
        agentHealth={agentHealth}
        businessId={businessId}
      />

      {/* 5-panel mission control grid */}
      <div className="flex-1 grid grid-cols-12 grid-rows-2 gap-3 p-4
        min-h-0 max-h-[calc(100vh-60px)]">

        {/* Panel 1: Agent Brain — spans 3 cols, full height */}
        <div className="col-span-3 row-span-2">
          <AgentBrain reactSteps={sseState.reactSteps} />
        </div>

        {/* Panel 2: Price Chart — spans 5 cols, top row */}
        <div className="col-span-5 row-span-1">
          <PriceChart priceTicks={sseState.priceTicks} charter={charter} />
        </div>

        {/* Panel 3: Agent Network — spans 4 cols, top row */}
        <div className="col-span-4 row-span-1">
          <AgentNetwork a2aEvents={sseState.a2aEvents} agentHealth={agentHealth} />
        </div>

        {/* Panel 4: On-Chain Ledger — spans 5 cols, bottom row */}
        <div className="col-span-5 row-span-1">
          <OnChainLedger onchainEvents={sseState.onchainEvents} />
        </div>

        {/* Panel 5: P&L Tracker — spans 4 cols, bottom row */}
        <div className="col-span-4 row-span-1">
          <PnLTracker
            pnl={displayPnl}
            charter={charter}
            onPnLUpdate={setPnlOverride}
          />
        </div>
      </div>

      {/* Back to landing */}
      <button
        onClick={() => router.push('/')}
        className="fixed bottom-4 left-4 text-xs text-gray-600
          hover:text-gray-400 transition-colors bg-black/50
          px-3 py-1.5 rounded-full border border-white/10"
      >
        ← Create New Business
      </button>
    </main>
  )
}
