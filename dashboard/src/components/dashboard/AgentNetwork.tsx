'use client'
import { useEffect, useRef, useState } from 'react'
import type { AgentEvent, AgentHealth } from '@/lib/types'

const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  founder:       { x: 10,  y: 45 },
  price_monitor: { x: 28,  y: 15 },
  procurement:   { x: 46,  y: 45 },
  logistics:     { x: 64,  y: 75 },
  sales:         { x: 82,  y: 45 },
  accountant:    { x: 100, y: 15 },
}

const NODE_LABELS: Record<string, string> = {
  founder: 'Founder', price_monitor: 'Price\nMonitor',
  procurement: 'Procure', logistics: 'Logistics',
  sales: 'Sales', accountant: 'Accountant',
}

interface FlashEdge {
  from: string; to: string; label: string; id: number; ts: number
}

interface Props {
  a2aEvents:   AgentEvent[]
  agentHealth: Record<string, AgentHealth>
}

export function AgentNetwork({ a2aEvents, agentHealth }: Props) {
  const [flashEdges, setFlashEdges] = useState<FlashEdge[]>([])
  const [pulsingNodes, setPulsingNodes] = useState<Set<string>>(new Set())
  const counterRef = useRef(0)

  useEffect(() => {
    if (a2aEvents.length === 0) return
    const latest = a2aEvents[a2aEvents.length - 1]
    if (!latest.to || !latest.agent) return

    const fromId = latest.agent.toLowerCase().replace('agent','').replace(' ','_')
    const toId   = latest.to.toLowerCase().split('/')[0].replace('agent','').replace(/[:/]/g, '')

    const flash: FlashEdge = {
      from: fromId, to: toId,
      label: latest.capability || 'a2a',
      id: counterRef.current++,
      ts: Date.now()
    }

    setFlashEdges(prev => [...prev, flash])
    setPulsingNodes(prev => new Set([...prev, latest.agent]))

    const t1 = setTimeout(() => {
      setFlashEdges(prev => prev.filter(e => e.id !== flash.id))
    }, 3000)
    const t2 = setTimeout(() => {
      setPulsingNodes(prev => {
        const next = new Set(prev); next.delete(latest.agent); return next
      })
    }, 600)

    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [a2aEvents])

  return (
    <div className="h-full flex flex-col bg-black/20 rounded-xl
      border border-white/10 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"/>
          Agent Network
        </h2>
      </div>

      <div className="flex-1 relative p-4">
        <svg width="100%" height="100%" viewBox="0 0 120 100"
          preserveAspectRatio="xMidYMid meet">

          {/* Static edges */}
          {[
            ['founder','price_monitor'],['founder','procurement'],
            ['procurement','logistics'],['logistics','sales'],
            ['sales','accountant'],['founder','accountant']
          ].map(([a, b]) => {
            const pa = NODE_POSITIONS[a], pb = NODE_POSITIONS[b]
            if (!pa || !pb) return null
            return (
              <line key={`${a}-${b}`}
                x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                stroke="#1f2937" strokeWidth="0.5"
              />
            )
          })}

          {/* Flash edges */}
          {flashEdges.map(edge => {
            const pa = NODE_POSITIONS[edge.from]
            const pb = NODE_POSITIONS[edge.to]
            if (!pa || !pb) return null
            const mx = (pa.x + pb.x) / 2
            const my = (pa.y + pb.y) / 2
            return (
              <g key={edge.id}>
                <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                  stroke="#60a5fa" strokeWidth="1.5"
                  strokeDasharray="2,1" opacity="0.8">
                  <animate attributeName="opacity"
                    values="0.8;0.2;0" dur="3s" fill="freeze" />
                </line>
                <text x={mx} y={my - 1}
                  fill="#93c5fd" fontSize="3" textAnchor="middle">
                  {edge.label}
                </text>
              </g>
            )
          })}

          {/* Agent nodes */}
          {Object.entries(NODE_POSITIONS).map(([id, pos]) => {
            const health = agentHealth[id]
            const isPulsing = pulsingNodes.has(id)
            const isConnected = health?.status === 'connected'
            const nodeColor = isConnected ? '#22c55e' : '#374151'
            const ringColor = isConnected ? '#22c55e' : '#1f2937'

            return (
              <g key={id}>
                {isPulsing && (
                  <circle cx={pos.x} cy={pos.y} r="5" fill="none"
                    stroke="#60a5fa" strokeWidth="0.5" opacity="0.6">
                    <animate attributeName="r" values="5;8;5" dur="0.6s" />
                    <animate attributeName="opacity" values="0.6;0;0.6" dur="0.6s" />
                  </circle>
                )}
                <circle cx={pos.x} cy={pos.y} r="4.5"
                  fill="#0a0a0a" stroke={ringColor} strokeWidth="0.5" />
                <circle cx={pos.x} cy={pos.y} r="2"
                  fill={nodeColor}>
                  {isConnected && (
                    <animate attributeName="opacity"
                      values="1;0.6;1" dur="2s" repeatCount="indefinite" />
                  )}
                </circle>
                {NODE_LABELS[id]?.split('\n').map((line, i) => (
                  <text key={i} x={pos.x} y={pos.y + 7 + i * 3.5}
                    fill="#9ca3af" fontSize="2.8" textAnchor="middle">
                    {line}
                  </text>
                ))}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
