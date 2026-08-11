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

  retentionDays: parseInt(process.env.RETENTION_DAYS ?? '30', 10),

  ingestBufferEnabled: process.env.INGEST_BUFFER_ENABLED !== 'false',
  flushIntervalMs: parseInt(process.env.FLUSH_INTERVAL_MS ?? '200', 10),
  flushBatchSize: parseInt(process.env.FLUSH_BATCH_SIZE ?? '10000', 10),
  queueMaxSize: parseInt(process.env.QUEUE_MAX_SIZE ?? '500000', 10),
};
