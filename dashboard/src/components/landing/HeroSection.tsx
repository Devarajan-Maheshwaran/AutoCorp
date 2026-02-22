'use client'
import { motion } from 'framer-motion'

export function HeroSection() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="text-center py-16 px-4"
    >
      <div className="inline-flex items-center gap-2 bg-white/5 border
        border-white/10 rounded-full px-4 py-1.5 text-sm text-gray-400
        mb-6">
        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"/>
        Powered by AI Agents on Ethereum Sepolia
      </div>

      <h1 className="text-5xl md:text-7xl font-bold text-white mb-4
                     leading-tight tracking-tight">
        AutoCorp
        <span className="text-transparent bg-clip-text
          bg-gradient-to-r from-blue-400 to-purple-500">
          {' '}Engine
        </span>
      </h1>

      <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-4">
        Describe a business. Deposit capital. Watch AI agents
        trade autonomously and return profit to your account.
      </p>

      <p className="text-sm text-gray-600 max-w-xl mx-auto">
        Smart contract escrow · ReAct AI agents · On-chain P&L ·
        Auto-dissolution · INR payout via Razorpay
      </p>
    </motion.div>
  )
}
