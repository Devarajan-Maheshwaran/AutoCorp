'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function PriceChart({ priceTicks }) {
  // Transform ticks for Recharts
  const chartData = priceTicks.map((tick, i) => ({
    index: i,
    time: new Date(tick.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    jodhpur: tick.jodhpur?.price_per_quintal,
    mumbai: tick.mumbai?.price_per_quintal,
    spread: tick.spread,
    date: tick.simulated_date
  }));

  const latestTick = priceTicks[priceTicks.length - 1];
  const spread = latestTick?.spread || 0;
  const spreadPct = latestTick?.spread_percentage || '0';
  const sourceLabel = latestTick?.source_label || 'Agmarknet Historical Replay';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-cyan-400">Live Mandi Prices</h2>
          <p className="text-xs text-gray-500">Source: {sourceLabel}</p>
        </div>
        <div className="flex gap-4 text-xs">
          <div className="text-right">
            <div className="text-gray-400">Spread</div>
            <div className={`font-mono font-bold ${spread > 1500 ? 'text-green-400' : spread > 500 ? 'text-yellow-400' : 'text-red-400'}`}>
              ₹{spread?.toLocaleString('en-IN')} ({spreadPct}%)
            </div>
          </div>
          <div className="text-right">
            <div className="text-gray-400">Sim Date</div>
            <div className="font-mono text-white">{latestTick?.simulated_date || '—'}</div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 p-2">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-600 text-sm">
            Waiting for price data...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                interval={Math.max(0, Math.floor(chartData.length / 8))}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#6b7280' }}
                domain={['auto', 'auto']}
                tickFormatter={(v) => `₹${(v / 1000).toFixed(1)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111827',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value, name) => [`₹${value?.toLocaleString('en-IN')}/q`, name]}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px' }}
              />
              <Line
                type="monotone"
                dataKey="jodhpur"
                name="Jodhpur (Buy)"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="mumbai"
                name="Mumbai (Sell)"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Price Summary */}
      {latestTick && (
        <div className="px-4 py-2 border-t border-gray-800 flex gap-6 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-amber-500" />
            <span className="text-gray-400">Jodhpur:</span>
            <span className="text-amber-400 font-mono font-bold">
              ₹{latestTick.jodhpur?.price_per_quintal?.toLocaleString('en-IN')}/q
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-cyan-500" />
            <span className="text-gray-400">Mumbai:</span>
            <span className="text-cyan-400 font-mono font-bold">
              ₹{latestTick.mumbai?.price_per_quintal?.toLocaleString('en-IN')}/q
            </span>
          </div>
          <div className="text-gray-600 ml-auto">
            Day {latestTick.day_number}/30
          </div>
        </div>
      )}
    </div>
  );
}
