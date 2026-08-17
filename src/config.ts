import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // App
  port: parseInt(process.env.PORT ?? '8080', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://postgres:your_password_here@localhost:5432/log_ingestion_db',
  pgWritePoolMax: parseInt(process.env.PG_WRITE_POOL_MAX ?? '1', 10),
  pgQueryPoolMax: parseInt(process.env.PG_QUERY_POOL_MAX ?? '2', 10),
  pgAggregatePoolMax: parseInt(process.env.PG_AGGREGATE_POOL_MAX ?? '2', 10),
  pgIdleTimeoutMs: parseInt(process.env.PG_IDLE_TIMEOUT_MS ?? '30000', 10),
  pgConnectionTimeoutMs: parseInt(
    process.env.PG_CONNECTION_TIMEOUT_MS ?? '15000',
    10,
  ),

  // enqueue() awaits durable flush — coalesces concurrent POSTs into bulk COPY.
  ingestBufferEnabled: process.env.INGEST_BUFFER_ENABLED !== 'false',
  flushIntervalMs: parseInt(process.env.FLUSH_INTERVAL_MS ?? '5', 10),
  flushBatchSize: parseInt(process.env.FLUSH_BATCH_SIZE ?? '4000', 10),
  flushConcurrency: parseInt(process.env.FLUSH_CONCURRENCY ?? '1', 10),
  queueMaxSize: parseInt(process.env.QUEUE_MAX_SIZE ?? '100000', 10),

  /**
   * How long to keep log partitions. Applied to pg_partman at startup.
   * Default 30 days. Invalid or non-positive values fall back to 30.
   */
  retentionDays: parseRetentionDays(process.env.RETENTION_DAYS),
};

function parseRetentionDays(raw: string | undefined): number {
  const n = parseInt(raw ?? '30', 10);
  if (!Number.isFinite(n) || n < 1) return 30;
  return n;
}
