'use client'
import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'
import type { Charter } from '@/lib/types'

interface Props {
  priceTicks: {
    source:      { ts: number; price: number }[]
    destination: { ts: number; price: number }[]
  }
  charter: Charter | null
}

export function PriceChart({ priceTicks, charter }: Props) {
  // Merge source and destination price series by time
  const chartData = useMemo(() => {
    const allTs = new Set([
      ...priceTicks.source.map(p => p.ts),
      ...priceTicks.destination.map(p => p.ts)
    ])
    const srcMap  = new Map(priceTicks.source.map(p => [p.ts, p.price]))
    const destMap = new Map(priceTicks.destination.map(p => [p.ts, p.price]))

    return Array.from(allTs)
      .sort((a, b) => a - b)
      .slice(-30)
      .map(ts => ({
        time:   new Date(ts * 1000).toLocaleTimeString(),
        source: srcMap.get(ts) ?? null,
        dest:   destMap.get(ts) ?? null,
        spread: (srcMap.get(ts) && destMap.get(ts))
          ? (destMap.get(ts)! - srcMap.get(ts)!).toFixed(4)
          : null
      }))
  }, [priceTicks])

  const priceUnit = charter?.price_unit || 'Price'
  const srcLabel  = charter?.buy_source?.name || 'Source'
  const destLabel = charter?.sell_destination?.name || 'Destination'
  const threshold = charter?.risk_params?.stop_loss_pct

  return (
    <div className="h-full flex flex-col bg-black/20 rounded-xl
      border border-white/10 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center
        justify-between">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"/>
          Live Price Feed
        </h2>
        <span className="text-xs text-gray-600">{priceUnit}</span>
      </div>

      <div className="flex-1 p-2">
        {chartData.length < 2 ? (
          <div className="flex items-center justify-center h-full
            text-gray-600 text-sm">
            Waiting for first price tick...
            <div className="text-xs block mt-1 text-gray-700">
              Prices update every {charter?.price_monitor_config
                ?.poll_interval_seconds || 30}s
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: '#0a0a0a', border: '1px solid #1f2937',
                  borderRadius: '8px', fontSize: '12px'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <Line type="monotone" dataKey="source"
                stroke="#60a5fa" strokeWidth={2}
                dot={false} name={srcLabel} connectNulls />
              <Line type="monotone" dataKey="dest"
                stroke="#f97316" strokeWidth={2}
                dot={false} name={destLabel} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
