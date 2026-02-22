/**
 * Chart Data Helpers — transforms raw price ticks and PnL data
 * into formats consumable by recharts or lightweight chart components.
 */

export interface PriceTick {
  ts: number
  price: number
}

export interface ChartPoint {
  time: string
  value: number
  label?: string
}

/**
 * Convert raw price ticks (timestamp + price) into chart-friendly points.
 * Limits to the most recent `maxPoints` entries.
 */
export function pricesToChartData(
  ticks: PriceTick[],
  maxPoints = 60
): ChartPoint[] {
  const recent = ticks.slice(-maxPoints)
  return recent.map(t => ({
    time: formatTimestamp(t.ts),
    value: t.price,
  }))
}

/**
 * Create a dual-series chart (source vs destination prices).
 */
export function dualPriceSeries(
  sourceTicks: PriceTick[],
  destTicks: PriceTick[],
  maxPoints = 60
): { time: string; source: number; destination: number }[] {
  const sourceRecent = sourceTicks.slice(-maxPoints)
  const destRecent = destTicks.slice(-maxPoints)
  const len = Math.max(sourceRecent.length, destRecent.length)

  const result: { time: string; source: number; destination: number }[] = []

  for (let i = 0; i < len; i++) {
    const sourceItem = sourceRecent[i]
    const destItem = destRecent[i]
    const ts = sourceItem?.ts || destItem?.ts || 0

    result.push({
      time: formatTimestamp(ts),
      source: sourceItem?.price ?? 0,
      destination: destItem?.price ?? 0,
    })
  }

  return result
}

/**
 * Compute a running P&L series from trade events.
 */
export function pnlTimeSeries(
  trades: Array<{ ts: number; net_profit_usdc: number }>
): ChartPoint[] {
  let cumulative = 0
  return trades.map(t => {
    cumulative += t.net_profit_usdc
    return {
      time: formatTimestamp(t.ts),
      value: cumulative,
      label: `$${cumulative.toFixed(2)}`,
    }
  })
}

/**
 * Calculate spread percentage between two prices.
 */
export function spreadPct(buyPrice: number, sellPrice: number): number {
  if (buyPrice <= 0) return 0
  return ((sellPrice - buyPrice) / buyPrice) * 100
}

/**
 * Format a UNIX timestamp into HH:MM:SS
 */
function formatTimestamp(ts: number): string {
  if (!ts) return '--:--:--'
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * Moving average over a sliding window.
 */
export function movingAverage(data: number[], window: number): number[] {
  const result: number[] = []
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - window + 1)
    const slice = data.slice(start, i + 1)
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length
    result.push(avg)
  }
  return result
}
