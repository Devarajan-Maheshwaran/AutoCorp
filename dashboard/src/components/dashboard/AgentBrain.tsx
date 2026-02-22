'use client'
import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SimulatedBadge } from '@/components/common/SimulatedBadge'
import type { AgentEvent } from '@/lib/types'

interface Props { reactSteps: AgentEvent[] }

function TypewriterText({ text, speed = 15 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState('')
  useEffect(() => {
    setDisplayed('')
    let i = 0
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1))
        i++
      } else {
        clearInterval(interval)
      }
    }, speed)
    return () => clearInterval(interval)
  }, [text])
  return <span>{displayed}</span>
}

const actionColor: Record<string, string> = {
  TRIGGER_BUY:     'text-green-400',
  EXECUTE_BUY:     'text-green-400',
  EXECUTE_SIMULTANEOUS: 'text-green-400',
  ACCEPT_OFFER:    'text-green-400',
  ENTER_FUNDING_ARB: 'text-green-400',
  WAIT:            'text-yellow-400',
  WAIT_BETTER:     'text-yellow-400',
  HOLD_PRICE:      'text-yellow-400',
  HOLD:            'text-yellow-400',
  ABORT:           'text-red-400',
  SKIP_ANOMALY:    'text-red-400',
  CUT_LOSS_SELL:   'text-red-400',
  CALL_TOOL:       'text-blue-400',
  REPRICE:         'text-orange-400',
}

function getActionColor(action: string): string {
  for (const [key, color] of Object.entries(actionColor)) {
    if (action.startsWith(key)) return color
  }
  return 'text-gray-400'
}

export function AgentBrain({ reactSteps }: Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  const latest = reactSteps[activeIdx]

  return (
    <div className="h-full flex flex-col bg-black/20 rounded-xl
      border border-white/10 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center
        justify-between">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"/>
          Agent Brain — ReAct Reasoning
        </h2>
        <span className="text-xs text-gray-600">
          {reactSteps.length} steps
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {reactSteps.length === 0 ? (
          <div className="text-center text-gray-600 text-sm py-8">
            Waiting for first reasoning step...
            <div className="text-xs mt-2">
              Click Execute Pipeline to trigger agents
            </div>
          </div>
        ) : (
          <AnimatePresence>
            {reactSteps.slice(0, 10).map((step, i) => (
              <motion.div
                key={`${step.agent}-${step.ts}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`space-y-2 p-3 rounded-lg border
                  ${i === 0
                    ? 'border-purple-500/30 bg-purple-500/5'
                    : 'border-white/5 bg-white/2'
                  }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-purple-400 font-semibold capitalize">
                    {step.agent.replace(/_/g,' ')}
                  </span>
                  <div className="flex items-center gap-2">
                    {step.simulated && <SimulatedBadge />}
                    <span className="text-gray-600">
                      {new Date(step.ts * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {/* Thought */}
                {step.thought && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Thought:</div>
                    <div className="text-gray-300 text-xs leading-relaxed">
                      {i === 0
                        ? <TypewriterText text={step.thought} />
                        : step.thought
                      }
                    </div>
                  </div>
                )}

                {/* Action */}
                {step.action && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Action:</div>
                    <div className={`font-mono text-xs font-medium
                      ${getActionColor(step.action)}`}>
                      {step.action}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
