'use client'
import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { getPnL } from '@/lib/api'
import type { PnLState, Charter } from '@/lib/types'

interface Props {
  pnl: PnLState
  charter: Charter | null
  onPnLUpdate: (pnl: PnLState) => void
}

export function PnLTracker({ pnl, charter, onPnLUpdate }: Props) {
  // Poll accountant every 5 seconds as primary source
  useEffect(() => {
    const poll = async () => {
      try {
        const fresh = await getPnL()
        if (fresh && fresh.total_invested > 0) {
          onPnLUpdate(fresh)
        }
      } catch {}
    }
    poll()
    const t = setInterval(poll, 5000)
    return () => clearInterval(t)
  }, [])

  const invested = charter?.budget_usdc || pnl.total_invested
  const daysTotal = charter?.duration_days || 30
  const deadline = charter?.deadline_timestamp
    ? charter.deadline_timestamp * 1000
    : Date.now() + daysTotal * 86400000
  const daysElapsed = Math.min(
    daysTotal,
    Math.floor((Date.now() - (deadline - daysTotal * 86400000)) / 86400000)
  )
  const progressPct = Math.min(100, (daysElapsed / daysTotal) * 100)

  const profitColor = pnl.gross_profit >= 0 ? 'text-green-400' : 'text-red-400'

  return (
    <div className="h-full flex flex-col bg-black/20 rounded-xl
      border border-white/10 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"/>
          P&L Tracker
        </h2>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Key metrics grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: 'Budget',   value: `$${invested.toFixed(2)}`,        color: 'text-white' },
            { label: 'Spent',    value: `-$${pnl.total_spent.toFixed(2)}`, color: 'text-red-400' },
            { label: 'Revenue',  value: `+$${pnl.total_revenue.toFixed(2)}`, color: 'text-green-400' },
            { label: 'Profit',   value: `${pnl.gross_profit >= 0 ? '+' : ''}$${pnl.gross_profit.toFixed(2)}`, color: profitColor },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white/5 rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">{label}</div>
              <div className={`font-bold font-mono ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* ROI */}
        <div className="bg-white/5 rounded-lg p-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-gray-500 text-xs">ROI</span>
            <span className={`font-bold text-lg ${profitColor}`}>
              {pnl.roi_pct >= 0 ? '+' : ''}{pnl.roi_pct.toFixed(2)}%
            </span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              animate={{ width: `${Math.min(100, Math.abs(pnl.roi_pct))}%` }}
              className={`h-full rounded-full ${
                pnl.roi_pct >= 0 ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
          </div>
        </div>

        {/* Trade counts */}
        <div className="flex gap-3 text-xs">
          <div className="flex-1 bg-white/5 rounded-lg p-2 text-center">
            <div className="text-gray-500">Opened</div>
            <div className="text-white font-bold">{pnl.lots_purchased}</div>
          </div>
          <div className="flex-1 bg-white/5 rounded-lg p-2 text-center">
            <div className="text-gray-500">Closed</div>
            <div className="text-white font-bold">{pnl.lots_sold}</div>
          </div>
          <div className="flex-1 bg-white/5 rounded-lg p-2 text-center">
            <div className="text-gray-500">Open</div>
            <div className="text-yellow-400 font-bold">{pnl.open_trades}</div>
          </div>
        </div>

        {/* Time progress */}
        <div>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Day {daysElapsed} of {daysTotal}</span>
            <span>{progressPct.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              animate={{ width: `${progressPct}%` }}
              className="h-full bg-blue-500 rounded-full"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
