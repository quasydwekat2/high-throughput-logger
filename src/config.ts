import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // App
  port: parseInt(process.env.PORT ?? '8080', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  databaseUrl: process.env.DATABASE_URL ?? '',
  pgWritePoolMax: parseInt(process.env.PG_WRITE_POOL_MAX ?? '2', 10),
  pgQueryPoolMax: parseInt(process.env.PG_QUERY_POOL_MAX ?? '12', 10),
  pgAggregatePoolMax: parseInt(process.env.PG_AGGREGATE_POOL_MAX ?? '2', 10),
  pgIdleTimeoutMs: parseInt(process.env.PG_IDLE_TIMEOUT_MS ?? '30000', 10),
  pgConnectionTimeoutMs: parseInt(
    process.env.PG_CONNECTION_TIMEOUT_MS ?? '15000',
    10,
  ),

  // enqueue() awaits durable flush — coalesces concurrent POSTs into bulk COPY.
  ingestBufferEnabled: process.env.INGEST_BUFFER_ENABLED !== 'false',
  flushIntervalMs: parseInt(process.env.FLUSH_INTERVAL_MS ?? '25', 10),
  flushBatchSize: parseInt(process.env.FLUSH_BATCH_SIZE ?? '5000', 10),
  flushConcurrency: parseInt(process.env.FLUSH_CONCURRENCY ?? '1', 10),
  queueMaxSize: parseInt(process.env.QUEUE_MAX_SIZE ?? '500000', 10),

  /** Retention window used as default query bound for partition pruning (days). */
  retentionDays: parseInt(process.env.RETENTION_DAYS ?? '30', 10),
};
