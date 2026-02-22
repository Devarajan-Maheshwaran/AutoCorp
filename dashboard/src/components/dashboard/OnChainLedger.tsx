'use client'
import { EtherscanLink } from '@/components/common/EtherscanLink'
import { SimulatedBadge } from '@/components/common/SimulatedBadge'
import { CHAIN } from '@/lib/constants'
import type { AgentEvent } from '@/lib/types'

interface Props { onchainEvents: AgentEvent[] }

export function OnChainLedger({ onchainEvents }: Props) {
  return (
    <div className="h-full flex flex-col bg-black/20 rounded-xl
      border border-white/10 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center
        justify-between">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"/>
          On-Chain Ledger
        </h2>
        <span className="text-xs text-gray-600">
          {CHAIN.name} · Chain {CHAIN.id}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {onchainEvents.length === 0 ? (
          <div className="text-center text-gray-600 text-sm py-8 px-4">
            Awaiting on-chain transactions...
            <div className="text-xs mt-2 text-gray-700">
              Requires deployed contract — coordinate with Member 3
            </div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-600 border-b border-white/5">
                <th className="text-left px-4 py-2">Time</th>
                <th className="text-left px-4 py-2">Event</th>
                <th className="text-left px-4 py-2">Amount</th>
                <th className="text-left px-4 py-2">Tx</th>
              </tr>
            </thead>
            <tbody>
              {onchainEvents.map((ev, i) => (
                <tr key={`${ev.ts}-${i}`}
                  className="border-b border-white/5 hover:bg-white/5
                    transition-colors">
                  <td className="px-4 py-2 text-gray-500 font-mono">
                    {new Date(ev.ts * 1000).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`font-medium ${
                      ev.event?.includes('Purchase') || ev.event?.includes('Open')
                        ? 'text-red-400'
                        : 'text-green-400'
                    }`}>
                      {ev.event}
                    </span>
                    {ev.simulated && <SimulatedBadge />}
                  </td>
                  <td className="px-4 py-2 text-gray-300 font-mono">
                    {ev.payload?.costUsdc
                      ? `-$${(Number(ev.payload.costUsdc)/1e6).toFixed(2)}`
                      : ev.payload?.revenueUsdc
                        ? `+$${(Number(ev.payload.revenueUsdc)/1e6).toFixed(2)}`
                        : '—'
                    }
                  </td>
                  <td className="px-4 py-2">
                    {ev.etherscan && ev.etherscan.includes('0x') ? (
                      <EtherscanLink hash={ev.etherscan.split('/tx/')[1] || ''} />
                    ) : (
                      <span className="text-gray-700">pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
