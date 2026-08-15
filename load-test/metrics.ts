export type LatencyStats = {
  n: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
};

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

export function latencyStats(samples: number[]): LatencyStats {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.length === 0 ? NaN : sorted[sorted.length - 1]!,
  };
}

export function fmtMs(n: number): string {
  if (!Number.isFinite(n)) return 'n/a';
  return `${n.toFixed(1)}ms`;
}

export function fmtRate(n: number): string {
  return `${n.toFixed(0)}/s`;
}
