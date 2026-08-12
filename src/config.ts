import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // App
  port: parseInt(process.env.PORT ?? '8080', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  // Database — separate pools so ingest COPY cannot starve query/aggregate
  databaseUrl: process.env.DATABASE_URL ?? '',
  pgWritePoolMax: parseInt(process.env.PG_WRITE_POOL_MAX ?? '4', 10),
  pgReadPoolMax: parseInt(process.env.PG_READ_POOL_MAX ?? '6', 10),
  pgIdleTimeoutMs: parseInt(process.env.PG_IDLE_TIMEOUT_MS ?? '30000', 10),
  pgConnectionTimeoutMs: parseInt(
    process.env.PG_CONNECTION_TIMEOUT_MS ?? '15000',
    10,
  ),

  // Ingestion buffer (set INGEST_BUFFER_ENABLED=false for sync writes).
  // enqueue() awaits durable flush — coalesces concurrent POSTs into bulk COPY.
  //
  // Tuning for 1-CPU Postgres:
  //   FLUSH_INTERVAL_MS   = 50   → low wait when traffic is below batch size
  //   FLUSH_BATCH_SIZE    = 4000 → shorter COPY holds; leaves CPU for reads
  //   FLUSH_CONCURRENCY   = 2    → at most 2 in-flight writes (fits write pool)
  //   QUEUE_MAX_SIZE      = 500000 → back-pressure via 503 instead of unbounded RAM
  ingestBufferEnabled: process.env.INGEST_BUFFER_ENABLED !== 'false',
  flushIntervalMs: parseInt(process.env.FLUSH_INTERVAL_MS ?? '50', 10),
  flushBatchSize: parseInt(process.env.FLUSH_BATCH_SIZE ?? '4000', 10),
  flushConcurrency: parseInt(process.env.FLUSH_CONCURRENCY ?? '2', 10),
  queueMaxSize: parseInt(process.env.QUEUE_MAX_SIZE ?? '500000', 10),

  /** Retention window used as default query bound for partition pruning (days). */
  retentionDays: parseInt(process.env.RETENTION_DAYS ?? '30', 10),
};
