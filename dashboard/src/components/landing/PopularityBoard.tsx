'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getPopularityData } from '@/lib/api'
import { CategoryBadge } from '@/components/common/CategoryBadge'
import type { PopularityData, CategoryId } from '@/lib/types'

export function PopularityBoard() {
  const [data, setData] = useState<PopularityData[]>([])

  useEffect(() => {
    getPopularityData().then(setData)
    // Refresh every 60 seconds
    const t = setInterval(() => getPopularityData().then(setData), 60000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Platform Statistics
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {data.map((d, i) => (
          <motion.div key={d.category_id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3"
          >
            <CategoryBadge category={d.category_id as CategoryId} />

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-gray-600">Businesses</div>
                <div className="text-white font-semibold text-base">
                  {d.total_businesses}
                </div>
              </div>
              <div>
                <div className="text-gray-600">Active now</div>
                <div className="text-green-400 font-semibold text-base">
                  {d.active_businesses}
                </div>
              </div>
              <div>
                <div className="text-gray-600">Avg ROI</div>
                <div className="text-green-400 font-medium">
                  +{d.avg_roi_pct.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-gray-600">Success rate</div>
                <div className="text-blue-400 font-medium">
                  {d.success_rate_pct}%
                </div>
              </div>
            </div>

            {/* Success rate bar */}
            <div className="space-y-1">
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${d.success_rate_pct}%` }}
                  transition={{ duration: 1, delay: i * 0.2 }}
                  className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full"
                />
              </div>
            </div>

            <div className="text-xs text-gray-600">
              Total profit distributed:{' '}
              <span className="text-green-400">
                ${d.total_profit_usdc.toLocaleString()} USDC
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
