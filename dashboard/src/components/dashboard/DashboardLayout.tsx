'use client'

import { ReactNode } from 'react'

interface DashboardLayoutProps {
  children: ReactNode
  businessId: string
  charter?: {
    asset?: string
    category?: string
    sub_strategy?: string
    budget_usdc?: number
    duration_days?: number
  }
  isSimulated?: boolean
}

export default function DashboardLayout({
  children,
  businessId,
  charter,
  isSimulated = true,
}: DashboardLayoutProps) {
  const category = charter?.category || 'unknown'
  const categoryLabel: Record<string, string> = {
    '1_crypto': 'Crypto Arbitrage',
    '2_compute': 'GPU Compute',
    '5_saas': 'SaaS Licence',
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top Bar */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/" className="text-sm text-gray-400 hover:text-gray-200 transition">
            ← Back to AutoCorp
          </a>
          <div className="h-5 w-px bg-gray-700" />
          <h1 className="font-semibold text-lg">
            Mission Control
          </h1>
          {charter?.asset && (
            <span className="text-sm text-gray-400">
              — {charter.asset}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isSimulated && (
            <span className="px-2 py-0.5 text-xs rounded bg-yellow-900/50 text-yellow-400 border border-yellow-800">
              SIMULATED
            </span>
          )}
          <span className="px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-300">
            {categoryLabel[category] || category}
          </span>
          <span className="text-xs text-gray-500 font-mono">
            {businessId.slice(0, 16)}…
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        {children}
      </main>
    </div>
  )
}
