'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { CATEGORIES } from '@/lib/constants'
import type { CategoryId } from '@/lib/types'

interface Props {
  selectedCategory: CategoryId | null
  selectedSubStrategy: string | null
  onSelectCategory: (id: CategoryId) => void
  onSelectSubStrategy: (id: string) => void
  popularityData?: Record<CategoryId, { avg_roi_pct: number; success_rate_pct: number }>
}

export function CategorySelector({
  selectedCategory, selectedSubStrategy,
  onSelectCategory, onSelectSubStrategy, popularityData
}: Props) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">
        Choose Your Business Model
      </h2>

      {/* Category Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CATEGORIES.map((cat, i) => {
          const isSelected = selectedCategory === cat.id
          const stats = popularityData?.[cat.id]

          return (
            <motion.button
              key={cat.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => onSelectCategory(cat.id as CategoryId)}
              className={`relative p-5 rounded-xl border text-left transition-all
                duration-200 hover:scale-[1.02] active:scale-[0.98]
                ${isSelected
                  ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
            >
              {/* Popularity indicator */}
              {stats && (
                <div className="absolute top-3 right-3 text-xs text-gray-500">
                  {stats.success_rate_pct}% success
                </div>
              )}

              <div className="text-3xl mb-3">{cat.icon}</div>
              <div className="font-semibold text-white mb-1">{cat.name}</div>
              <div className="text-xs text-gray-400 mb-3">{cat.description}</div>

              {stats && (
                <div className="flex gap-3 text-xs">
                  <span className="text-green-400">
                    avg {stats.avg_roi_pct.toFixed(1)}% ROI
                  </span>
                </div>
              )}

              {isSelected && (
                <motion.div
                  layoutId="selectedCategory"
                  className="absolute inset-0 rounded-xl ring-2 ring-blue-500"
                />
              )}
            </motion.button>
          )
        })}
      </div>

      {/* Sub-strategy picker */}
      {selectedCategory && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-3"
        >
          <h3 className="text-sm font-medium text-gray-400">
            Select Strategy
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CATEGORIES.find(c => c.id === selectedCategory)
              ?.sub_strategies.map(ss => {
                const isSelected = selectedSubStrategy === ss.id
                const riskColor = {
                  low: 'text-green-400',
                  medium: 'text-yellow-400',
                  high: 'text-red-400'
                }[ss.risk]

                return (
                  <button
                    key={ss.id}
                    onClick={() => onSelectSubStrategy(ss.id)}
                    className={`p-4 rounded-lg border text-left transition-all
                      ${isSelected
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                  >
                    <div className="font-medium text-white text-sm mb-1">
                      {ss.name}
                    </div>
                    <div className="text-xs text-gray-400 mb-2">
                      {ss.description}
                    </div>
                    <div className="flex gap-4 text-xs">
                      <span className="text-green-400">{ss.typical_roi}</span>
                      <span className={riskColor}>{ss.risk} risk</span>
                      <span className="text-gray-500">{ss.speed}</span>
                    </div>
                  </button>
                )
              })}
          </div>
        </motion.div>
      )}
    </div>
  )
}
