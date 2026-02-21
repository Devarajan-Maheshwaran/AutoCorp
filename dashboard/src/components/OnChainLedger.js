'use client';

import { useState, useEffect } from 'react';

export default function OnChainLedger({ paymentEvents, allEvents }) {
  const [payments, setPayments] = useState([]);

  // Fetch payment ledger from API
  useEffect(() => {
    const fetchPayments = async () => {
      try {
        const res = await fetch('/api/events/payments');
        if (res.ok) {
          const data = await res.json();
          setPayments(data.data || []);
        }
      } catch { /* API might not be running */ }
    };

    fetchPayments();
    const interval = setInterval(fetchPayments, 5000);
    return () => clearInterval(interval);
  }, []);

  // Extract on-chain-relevant events (orders, bookings, payments)
  const chainEvents = allEvents.filter(e =>
    e.type === 'x402_payment' ||
    e.action === 'x402_payment' ||
    e.details?.payment_proof ||
    e.type === 'agent_online' ||
    e.type === 'delivery_complete'
  ).slice(0, 20);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-emerald-400">On-Chain Ledger</h2>
          <p className="text-xs text-gray-500">Polygon Amoy Testnet — X402 Payments</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-xs text-gray-500">{payments.length} txns</span>
        </div>
      </div>

      {/* Payment Table */}
      <div className="flex-1 overflow-y-auto">
        {payments.length === 0 && chainEvents.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-600 text-sm">
            <div className="text-center">
              <div className="text-2xl mb-2">⛓️</div>
              <div>No on-chain transactions yet</div>
              <div className="text-xs mt-1">Trigger a booking to see X402 payments</div>
            </div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-800/50 sticky top-0">
              <tr className="text-gray-500">
                <th className="text-left px-3 py-2 font-medium">Action</th>
                <th className="text-left px-3 py-2 font-medium">From</th>
                <th className="text-right px-3 py-2 font-medium">Amount</th>
                <th className="text-left px-3 py-2 font-medium">Tx Hash</th>
                <th className="text-right px-3 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {payments.map((payment, i) => (
                <tr key={i} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-3 py-2">
                    <span className="text-emerald-400 font-medium">{payment.category || 'payment'}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-gray-400 font-mono text-[10px]">
                      {(payment.payer || '').slice(0, 14)}...
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="text-white font-mono">
                      {payment.price_wei ? `${(parseInt(payment.price_wei) / 1e18).toFixed(4)} MATIC` : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-cyan-400 font-mono text-[10px] cursor-pointer hover:underline">
                      {(payment.proof || '').slice(0, 16)}...
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">
                    {payment.timestamp ? new Date(payment.timestamp).toLocaleTimeString('en-IN', {
                      hour: '2-digit', minute: '2-digit', second: '2-digit'
                    }) : '—'}
                  </td>
                </tr>
              ))}

              {/* Chain events as supplementary rows */}
              {chainEvents.map((event, i) => (
                <tr key={`ev-${i}`} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-3 py-2">
                    <span className={`font-medium ${
                      event.type === 'agent_online' ? 'text-blue-400' :
                      event.type === 'delivery_complete' ? 'text-green-400' :
                      'text-amber-400'
                    }`}>
                      {event.type === 'agent_online' ? '🟢 Agent Online' :
                       event.type === 'delivery_complete' ? '📦 Delivery' :
                       event.action || event.type}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-gray-400 text-[10px]">
                      {event.agent_name || event.agent_id}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">—</td>
                  <td className="px-3 py-2 text-gray-600 text-[10px]">event_bus</td>
                  <td className="px-3 py-2 text-right text-gray-500">
                    {new Date(event.timestamp).toLocaleTimeString('en-IN', {
                      hour: '2-digit', minute: '2-digit', second: '2-digit'
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer: Testnet info */}
      <div className="px-4 py-2 border-t border-gray-800 flex items-center justify-between text-[10px] text-gray-600">
        <span>Network: Polygon Amoy (Chain 80002)</span>
        <span className="text-amber-500">[SIMULATED payments — testnet only]</span>
      </div>
    </div>
  );
}
