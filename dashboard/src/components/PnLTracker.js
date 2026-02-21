'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function PnLTracker({ priceTicks, events }) {
  // Calculate running P&L from price spread data
  const pnlData = useMemo(() => {
    if (priceTicks.length === 0) return [];

    // Fixed costs (per 20 quintals)
    const quantityQ = 20;
    const freightCostPerQ = 180; // Rivigo default
    const platformFee = 500; // Fixed platform fee
    const miscCosts = 300; // Handling, loading, etc.

    return priceTicks.map((tick, i) => {
      const buyPrice = tick.jodhpur?.price_per_quintal || 0;
      const sellPrice = tick.mumbai?.price_per_quintal || 0;
      const spread = sellPrice - buyPrice;

      // Revenue = spread * quantity
      const grossRevenue = spread * quantityQ;
      // Costs
      const freightCost = freightCostPerQ * quantityQ;
      const totalCost = freightCost + platformFee + miscCosts;
      // Net P&L
      const netPnL = grossRevenue - totalCost;
      // Margin
      const margin = grossRevenue > 0 ? ((netPnL / grossRevenue) * 100).toFixed(1) : 0;

      return {
        index: i,
        time: new Date(tick.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        date: tick.simulated_date,
        buy_price: buyPrice,
        sell_price: sellPrice,
        spread,
        gross_revenue: grossRevenue,
        freight_cost: freightCost,
        total_cost: totalCost,
        net_pnl: netPnL,
        margin: parseFloat(margin),
        profitable: netPnL > 0
      };
    });
  }, [priceTicks]);

  const latestPnL = pnlData[pnlData.length - 1];
  const avgPnL = pnlData.length > 0
    ? Math.round(pnlData.reduce((sum, d) => sum + d.net_pnl, 0) / pnlData.length)
    : 0;
  const profitableCount = pnlData.filter(d => d.profitable).length;
  const profitRate = pnlData.length > 0 ? ((profitableCount / pnlData.length) * 100).toFixed(0) : 0;

  // Extract costs from events
  const bookingEvents = events.filter(e =>
    e.action === 'x402_payment' || e.details?.total_cost
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-amber-400">Real-Time P&L</h2>
          <p className="text-xs text-gray-500">Projected profit per 20-quintal shipment</p>
        </div>

        {/* KPI Cards */}
        <div className="flex gap-4">
          <div className="text-right">
            <div className="text-[10px] text-gray-500">Net P&L / Shipment</div>
            <div className={`text-sm font-mono font-bold ${(latestPnL?.net_pnl || 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {latestPnL ? `₹${latestPnL.net_pnl.toLocaleString('en-IN')}` : '—'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-500">Avg P&L</div>
            <div className={`text-sm font-mono font-bold ${avgPnL > 0 ? 'text-green-400' : 'text-red-400'}`}>
              ₹{avgPnL.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-500">Profit Rate</div>
            <div className={`text-sm font-mono font-bold ${parseInt(profitRate) > 70 ? 'text-green-400' : 'text-yellow-400'}`}>
              {profitRate}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-500">Margin</div>
            <div className={`text-sm font-mono font-bold ${(latestPnL?.margin || 0) > 30 ? 'text-green-400' : 'text-yellow-400'}`}>
              {latestPnL?.margin || 0}%
            </div>
          </div>
        </div>
      </div>

      {/* P&L Chart */}
      <div className="flex-1 p-2">
        {pnlData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-600 text-sm">
            Waiting for price data to calculate P&L...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pnlData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                interval={Math.max(0, Math.floor(pnlData.length / 8))}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickFormatter={(v) => `₹${(v / 1000).toFixed(1)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111827',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  fontSize: '11px'
                }}
                formatter={(value, name) => {
                  if (name === 'net_pnl') return [`₹${value?.toLocaleString('en-IN')}`, 'Net P&L'];
                  if (name === 'gross_revenue') return [`₹${value?.toLocaleString('en-IN')}`, 'Gross Revenue'];
                  if (name === 'total_cost') return [`₹${value?.toLocaleString('en-IN')}`, 'Total Cost'];
                  return [value, name];
                }}
              />
              <ReferenceLine y={0} stroke="#4b5563" strokeWidth={1} />
              <Area
                type="monotone"
                dataKey="gross_revenue"
                name="gross_revenue"
                stroke="#06b6d4"
                fill="#06b6d4"
                fillOpacity={0.1}
                strokeWidth={1}
              />
              <Area
                type="monotone"
                dataKey="net_pnl"
                name="net_pnl"
                stroke="#22c55e"
                fill="#22c55e"
                fillOpacity={0.2}
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="total_cost"
                name="total_cost"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.05}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Cost Breakdown Footer */}
      <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-6 text-[10px]">
        <div className="text-gray-500">Cost breakdown (20q):</div>
        <div className="text-gray-400">Freight: <span className="text-red-300">₹3,600</span></div>
        <div className="text-gray-400">Platform: <span className="text-red-300">₹500</span></div>
        <div className="text-gray-400">Misc: <span className="text-red-300">₹300</span></div>
        <div className="text-gray-400 ml-auto">Total: <span className="text-red-400 font-bold">₹4,400</span></div>
        <div className="text-amber-500">[SIMULATED costs]</div>
      </div>
    </div>
  );
}
