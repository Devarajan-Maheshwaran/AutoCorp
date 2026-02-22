'use client'
import { StatusDot } from '@/components/common/StatusDot'
import { CategoryBadge } from '@/components/common/CategoryBadge'
import { CHAIN } from '@/lib/constants'
import { triggerPipeline } from '@/lib/api'
import type { AgentHealth, Charter, CategoryId } from '@/lib/types'
import { useState } from 'react'

interface Props {
  charter: Charter | null
  agentHealth: Record<string, AgentHealth>
  businessId: string
}

export function ControlBar({ charter, agentHealth, businessId }: Props) {
  const [triggering, setTriggering] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const handleTrigger = async () => {
    setTriggering(true)
    try {
      await triggerPipeline()
      setToast('Pipeline triggered — watch Agent Brain panel')
      setTimeout(() => setToast(null), 4000)
    } catch {
      setToast('Failed to trigger — check agent health')
      setTimeout(() => setToast(null), 4000)
    }
    setTriggering(false)
  }

  return (
    <div className="bg-black/40 border-b border-white/10 px-6 py-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">

        {/* Left: Business info */}
        <div className="flex items-center gap-3">
          <div className="font-bold text-white">AutoCorp</div>
          {charter && (
            <>
              <CategoryBadge category={charter.category as CategoryId} />
              <span className="text-gray-400 text-sm font-mono">
                {charter.asset}
              </span>
              <span className="text-gray-600 text-xs">
                Budget: ${charter.budget_usdc?.toFixed(0)} USDC ·
                Min: {charter.min_margin_pct}% ·
                {charter.duration_days}d
              </span>
            </>
          )}
        </div>

        {/* Center: Agent status dots */}
        <div className="flex items-center gap-4 flex-wrap">
          {Object.entries(agentHealth).map(([id, h]) => (
            <StatusDot key={id} status={h.status} label={h.name} />
          ))}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-600">
            {CHAIN.name} · Chain {CHAIN.id}
          </div>
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500
              disabled:opacity-50 text-white text-sm font-medium
              rounded-lg transition-all"
          >
            {triggering ? '⏳ Triggering...' : '▶ Execute Pipeline'}
          </button>
        </div>
      </div>

      {toast && (
        <div className="mt-2 text-xs text-center text-blue-300 animate-pulse">
          {toast}
        </div>
      )}
    </div>
  )
}
