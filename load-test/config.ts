/** Load-test configuration (override via env or --smoke). */

/** Optional --smoke profile (smaller run; still aims at 15k/s). */
if (process.argv.includes('--smoke')) {
  process.env.TOTAL_LOGS ??= '100000';
  process.env.TARGET_LOGS_PER_SEC ??= '15000';
  // Fewer workers → less event-loop contention on the 0.5 CPU app container.
  process.env.CONCURRENCY ??= '12';
  process.env.WARMUP_SEC ??= '1';
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function floatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const loadTestConfig = {
  baseUrl: process.env.BASE_URL ?? 'http://localhost:8080',

  /** Sustained ingest target (logs/sec). */
  targetLogsPerSec: intEnv('TARGET_LOGS_PER_SEC', 15_000),

  /** Total logs to ingest (~1 month / ~1M rows). */
  totalLogs: intEnv('TOTAL_LOGS', 1_000_000),

  /** Logs per POST /logs body. */
  batchSize: intEnv('BATCH_SIZE', 500),

  /** Concurrent HTTP ingest workers. */
  concurrency: intEnv('CONCURRENCY', 32),

  /** Aggregation requests during ingest (1/sec). */
  aggregateIntervalMs: intEnv('AGGREGATE_INTERVAL_MS', 1_000),

  /** How often to issue GET /logs during ingest. */
  queryIntervalMs: intEnv('QUERY_INTERVAL_MS', 2_000),

  /** New data must appear in queries within this window. */
  visibilityDeadlineMs: intEnv('VISIBILITY_DEADLINE_MS', 20_000),

  /** Primary aggregation p95 must be under this. */
  aggregateP95MaxMs: intEnv('AGGREGATE_P95_MAX_MS', 1_000),

  /** Health poll timeout before aborting. */
  healthTimeoutMs: intEnv('HEALTH_TIMEOUT_MS', 120_000),

  /** Warm-up: skip rate accounting for first N seconds. */
  warmupSec: floatEnv('WARMUP_SEC', 5),

  /**
   * Pace slightly above target so jitter doesn't drop measured throughput
   * a hair below the pass bar (1.05 → clients aim at 105% of target).
   */
  paceFactor: floatEnv('PACE_FACTOR', 1.05),

  /** Services / levels used in synthetic traffic. */
  services: ['api', 'worker', 'billing', 'auth', 'gateway'] as const,
  levels: ['debug', 'info', 'warn', 'error'] as const,
};
