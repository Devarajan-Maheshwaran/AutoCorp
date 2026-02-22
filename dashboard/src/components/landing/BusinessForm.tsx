'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import type { CategoryId, Charter } from '@/lib/types'
import { previewCharter, createBusiness } from '@/lib/api'

interface Props {
  category: CategoryId
  subStrategy: string
  onBusinessCreated: (businessId: string) => void
}

export function BusinessForm({ category, subStrategy, onBusinessCreated }: Props) {
  const [budgetInr, setBudgetInr]   = useState(30000)
  const [duration,  setDuration]    = useState(30)
  const [minProfit, setMinProfit]   = useState(15)
  const [riskLevel, setRiskLevel]   = useState('medium')
  const [charter,   setCharter]     = useState<Charter | null>(null)
  const [loading,   setLoading]     = useState(false)
  const [step,      setStep]        = useState<'form' | 'preview' | 'deploying'>('form')
  const [error,     setError]       = useState<string | null>(null)

  const handlePreview = async () => {
    setLoading(true)
    setError(null)
    try {
      const c = await previewCharter({
        category, sub_strategy: subStrategy,
        budget_inr: budgetInr, duration_days: duration,
        min_profit_pct: minProfit, risk_level: riskLevel
      })
      setCharter(c)
      setStep('preview')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeploy = async () => {
    setStep('deploying')
    setLoading(true)
    try {
      const business = await createBusiness({
        category, sub_strategy: subStrategy,
        budget_inr: budgetInr, duration_days: duration,
        min_profit_pct: minProfit, risk_level: riskLevel
      })
      onBusinessCreated(business.business_id)
    } catch (e: any) {
      setError(e.message)
      setStep('preview')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'deploying') {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="text-4xl animate-bounce">🚀</div>
        <div className="text-white font-semibold">Deploying Your Business...</div>
        <div className="text-gray-400 text-sm space-y-1">
          <div>✅ Generating charter with Gemini AI</div>
          <div>✅ Deploying smart contract on Sepolia</div>
          <div className="animate-pulse">⏳ Configuring agent swarm...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {step === 'form' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-5"
        >
          <h2 className="text-lg font-semibold text-white">
            Configure Your Business
          </h2>

          {/* Budget */}
          <div>
            <label className="text-sm text-gray-400 block mb-2">
              Capital Budget (INR)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
              <input
                type="number" value={budgetInr}
                onChange={e => setBudgetInr(Number(e.target.value))}
                min={5000} max={1000000} step={1000}
                className="w-full bg-white/5 border border-white/10 rounded-lg
                  pl-8 pr-4 py-3 text-white focus:outline-none
                  focus:border-blue-500 transition-colors"
              />
            </div>
            <div className="text-xs text-gray-600 mt-1">
              ≈ ${(budgetInr / 83.5).toFixed(0)} USDC
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-sm text-gray-400 block mb-2">
              Duration: {duration} days
            </label>
            <input
              type="range" value={duration} min={1} max={90}
              onChange={e => setDuration(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>1 day</span><span>30 days</span><span>90 days</span>
            </div>
          </div>

          {/* Min Profit */}
          <div>
            <label className="text-sm text-gray-400 block mb-2">
              Minimum Profit Target: {minProfit}%
            </label>
            <input
              type="range" value={minProfit} min={5} max={50}
              onChange={e => setMinProfit(Number(e.target.value))}
              className="w-full accent-green-500"
            />
          </div>

          {/* Risk Level */}
          <div>
            <label className="text-sm text-gray-400 block mb-2">Risk Level</label>
            <div className="flex gap-3">
              {['low','medium','high'].map(r => (
                <button key={r} onClick={() => setRiskLevel(r)}
                  className={`flex-1 py-2 rounded-lg border text-sm capitalize
                    transition-all ${riskLevel === r
                      ? r === 'low'    ? 'border-green-500 bg-green-500/10 text-green-400'
                      : r === 'medium' ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400'
                      :                  'border-red-500 bg-red-500/10 text-red-400'
                      : 'border-white/10 text-gray-400 hover:border-white/20'
                    }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 border
              border-red-500/30 rounded-lg p-3">
              {error}
            </div>
          )}

          <button onClick={handlePreview} disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50
              text-white font-semibold rounded-xl transition-all duration-200
              hover:shadow-lg hover:shadow-blue-500/30">
            {loading ? 'Generating Charter...' : 'Preview Business Charter →'}
          </button>
        </motion.div>
      )}

      {/* Charter Preview */}
      {step === 'preview' && charter && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Business Charter Preview
            </h2>
            <button onClick={() => setStep('form')}
              className="text-xs text-gray-500 hover:text-gray-300">
              ← Edit
            </button>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-gray-500 text-xs">Asset</div>
                <div className="text-white font-mono">{charter.asset}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Strategy</div>
                <div className="text-white">{charter.sub_strategy}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Buy From</div>
                <div className="text-white">{charter.buy_source.name}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Sell On</div>
                <div className="text-white">{charter.sell_destination.name}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Budget</div>
                <div className="text-green-400">
                  ₹{budgetInr.toLocaleString()} / ${charter.budget_usdc.toFixed(0)} USDC
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Min Margin</div>
                <div className="text-green-400">{charter.min_margin_pct}%</div>
              </div>
            </div>
            <div className="border-t border-white/10 pt-3 space-y-1 text-xs">
              <div className="text-gray-500">Buy trigger:</div>
              <div className="text-gray-300 italic">"{charter.buy_trigger}"</div>
              <div className="text-gray-500 mt-1">Sell trigger:</div>
              <div className="text-gray-300 italic">"{charter.sell_trigger}"</div>
            </div>
          </div>

          <div className="text-xs text-gray-600 bg-yellow-500/5 border
            border-yellow-500/20 rounded-lg p-3">
            ⚠️ This charter will be hashed and stored on Ethereum Sepolia.
            It cannot be modified after deployment.
          </div>

          <button onClick={handleDeploy} disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600
              hover:from-blue-500 hover:to-purple-500 text-white font-bold
              rounded-xl transition-all duration-200 hover:shadow-xl
              hover:shadow-purple-500/30 text-base">
            🚀 Deploy Business & Start Agents
          </button>
        </motion.div>
      )}
    </div>
  )
}
