'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getLiveActivity } from '@/lib/api'
import { CategoryBadge } from '@/components/common/CategoryBadge'
import type { LiveActivity, CategoryId } from '@/lib/types'

export function LiveActivityFeed() {
  const [activities, setActivities] = useState<LiveActivity[]>([])

  useEffect(() => {
    getLiveActivity().then(setActivities)
    const t = setInterval(async () => {
      const fresh = await getLiveActivity()
      setActivities(fresh)
    }, 15000)
    return () => clearInterval(t)
  }, [])

  const formatTime = (ts: number) => {
    const diff = Math.floor(Date.now()/1000 - ts)
    if (diff < 60)  return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`
    return `${Math.floor(diff/3600)}h ago`
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"/>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Live Activity
        </h3>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        <AnimatePresence>
          {activities.map((a, i) => (
            <motion.div key={`${a.business_id}-${a.ts}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 p-3 bg-white/5
                border border-white/5 rounded-lg text-xs"
            >
              <CategoryBadge category={a.category_id as CategoryId} />
              <span className="text-gray-300 flex-1">{a.description}</span>
              {a.profit_usdc && (
                <span className="text-green-400 font-mono font-semibold">
                  +${a.profit_usdc.toFixed(2)}
                </span>
              )}
              <span className="text-gray-600 whitespace-nowrap">
                {formatTime(a.ts)}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
