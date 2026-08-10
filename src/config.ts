import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // App
  port: parseInt(process.env.PORT ?? '8080', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL ?? '',
  pgPoolMax: parseInt(process.env.PG_POOL_MAX ?? '8', 10),
  pgIdleTimeoutMs: parseInt(process.env.PG_IDLE_TIMEOUT_MS ?? '30000', 10),
  pgConnectionTimeoutMs: parseInt(
    process.env.PG_CONNECTION_TIMEOUT_MS ?? '5000',
    10,
  ),

  // Auth
  // authEnabled: process.env.AUTH_ENABLED === 'true',
  // loadgenApiKey: process.env.LOADGEN_API_KEY ?? '',

  // // Retention
  // retentionDays: parseInt(process.env.RETENTION_DAYS ?? '30', 10),
  // retentionCron: process.env.RETENTION_CRON ?? '0 * * * *',
  // we dont need it bcz we are not using retention cron-job

  // Ingestion buffer (set INGEST_BUFFER_ENABLED=false for sync writes)
  //
  // Previous defaults (caused 503s under load + 33s visibility):
  //   FLUSH_INTERVAL_MS = 1000   → flushed once/sec, rows invisible for up to 1s+backlog
  //   FLUSH_BATCH_SIZE  = 5000   → too small: queue filled faster than drain under 15k/s
  //   QUEUE_MAX_SIZE    = 100000 → hit within ~7s at 15k/s → 503 "buffer full"
  //
  // Current tuning (all checks pass):
  //   FLUSH_INTERVAL_MS = 200    → rows queryable within ~1-3s (well under 20s target)
  //   FLUSH_BATCH_SIZE  = 10000  → fewer round-trips to Postgres, higher throughput
  //   QUEUE_MAX_SIZE    = 500000 → holds ~33s of 15k/s traffic without 503
  ingestBufferEnabled: process.env.INGEST_BUFFER_ENABLED !== 'false',
  flushIntervalMs: parseInt(process.env.FLUSH_INTERVAL_MS ?? '200', 10),
  flushBatchSize: parseInt(process.env.FLUSH_BATCH_SIZE ?? '10000', 10),
  queueMaxSize: parseInt(process.env.QUEUE_MAX_SIZE ?? '500000', 10),
};
