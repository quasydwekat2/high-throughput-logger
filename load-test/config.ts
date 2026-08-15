import dotenv from 'dotenv';

dotenv.config();

export type LoadConfig = {
  baseUrl: string;
  targetLogsPerSec: number;
  totalLogs: number;
  batchSize: number;
  concurrency: number;
  aggregateIntervalMs: number;
  queryIntervalMs: number;
  visibilityDeadlineMs: number;
  aggregateP95MaxMs: number;
  warmupSec: number;
  healthTimeoutMs: number;
  paceFactor: number;
  smoke: boolean;
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be a number, got ${raw}`);
  }
  return n;
}

export function loadConfig(argv = process.argv.slice(2)): LoadConfig {
  const smoke = argv.includes('--smoke');
  return {
    baseUrl: (process.env.BASE_URL ?? 'http://localhost:8080').replace(/\/$/, ''),
    targetLogsPerSec: envInt('TARGET_LOGS_PER_SEC', 15_000),
    totalLogs: smoke ? envInt('SMOKE_TOTAL_LOGS', 100_000) : envInt('TOTAL_LOGS', 1_000_000),
    batchSize: envInt('BATCH_SIZE', 500),
    concurrency: envInt('CONCURRENCY', 32),
    aggregateIntervalMs: envInt('AGGREGATE_INTERVAL_MS', 1_000),
    queryIntervalMs: envInt('QUERY_INTERVAL_MS', 2_000),
    visibilityDeadlineMs: envInt('VISIBILITY_DEADLINE_MS', 20_000),
    aggregateP95MaxMs: envInt('AGGREGATE_P95_MAX_MS', 1_000),
    warmupSec: envInt('WARMUP_SEC', 5),
    healthTimeoutMs: envInt('HEALTH_TIMEOUT_MS', 120_000),
    paceFactor: Number(process.env.PACE_FACTOR ?? 1.05),
    smoke,
  };
}
