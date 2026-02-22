'use client'
import { useState, useEffect } from 'react'
import { AGENT_NODES } from '@/lib/constants'
import type { AgentHealth } from '@/lib/types'

export function useAgentHealth() {
  const [health, setHealth] = useState<Record<string, AgentHealth>>(
    Object.fromEntries(AGENT_NODES.map(n => [n.id, {
      name: n.label, url: n.url, port: n.port,
      status: 'unknown', last_checked: 0
    }]))
  )

  useEffect(() => {
    const check = async () => {
      const results = await Promise.allSettled(
        AGENT_NODES.map(async (node) => {
          try {
            const res = await fetch(`${node.url}/health`, { signal: AbortSignal.timeout(3000) })
            const data = res.ok ? await res.json() : null
            return { id: node.id, status: res.ok ? 'connected' : 'disconnected', data }
          } catch {
            return { id: node.id, status: 'disconnected', data: null }
          }
        })
      )
      setHealth(prev => {
        const next = { ...prev }
        results.forEach(r => {
          if (r.status === 'fulfilled') {
            const { id, status, data } = r.value
            next[id] = {
              ...next[id],
              status: status as AgentHealth['status'],
              last_checked: Date.now(),
              category: data?.category,
              asset: data?.asset
            }
          }
        })
        return next
      })
    }
    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [])

  return health
}
