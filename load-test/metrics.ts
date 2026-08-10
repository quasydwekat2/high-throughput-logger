export class LatencyTracker {
  private samples: number[] = [];

  record(ms: number): void {
    this.samples.push(ms);
  }

  get count(): number {
    return this.samples.length;
  }

  percentile(p: number): number {
    if (this.samples.length === 0) return Number.NaN;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const idx = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
    );
    return sorted[idx]!;
  }

  summary(): { count: number; p50: number; p95: number; p99: number; max: number } {
    return {
      count: this.samples.length,
      p50: this.percentile(50),
      p95: this.percentile(95),
      p99: this.percentile(99),
      max: this.samples.length === 0 ? Number.NaN : Math.max(...this.samples),
    };
  }
}

export class CounterMap {
  private map = new Map<string, number>();

  inc(key: string, by = 1): void {
    this.map.set(key, (this.map.get(key) ?? 0) + by);
  }

  get(key: string): number {
    return this.map.get(key) ?? 0;
  }

  toObject(): Record<string, number> {
    return Object.fromEntries(this.map.entries());
  }
}

export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return 'n/a';
  return `${ms.toFixed(1)}ms`;
}

export function fmtRate(n: number): string {
  if (!Number.isFinite(n)) return 'n/a';
  return `${n.toFixed(0)}/s`;
}

export function passFail(ok: boolean): string {
  return ok ? 'PASS' : 'FAIL';
}
