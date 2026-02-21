export function nowIso(): string {
  return new Date().toISOString();
}

export function makeTraceId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function withTxUrl(txHash?: string): string | undefined {
  if (!txHash) return undefined;
  const base = process.env.POLYGONSCAN_BASE_URL ?? "https://amoy.polygonscan.com/tx/";
  return `${base}${txHash}`;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
