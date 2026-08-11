import dotenv from "dotenv";
import { expand } from "dotenv-expand";

// .env uses ${VAR} interpolation (e.g. DATABASE_URL built from POSTGRES_*).
// Plain dotenv doesn't resolve those placeholders — dotenv-expand does.
// Inside Docker, compose already injects fully-resolved env vars, so this
// is a no-op there; it only matters when scripts run outside Docker.
expand(dotenv.config());

export const config = {
  // App
  port: parseInt(process.env.PORT ?? "8080", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",

  // Database
  databaseUrl: process.env.DATABASE_URL ?? "",
  pgPoolMax: parseInt(process.env.PG_POOL_MAX ?? "12", 10),
  pgIdleTimeoutMs: parseInt(process.env.PG_IDLE_TIMEOUT_MS ?? "30000", 10),
  pgConnectionTimeoutMs: parseInt(
    process.env.PG_CONNECTION_TIMEOUT_MS ?? "5000",
    10,
  ),

  // Auth
  // authEnabled: process.env.AUTH_ENABLED === 'true',
  // loadgenApiKey: process.env.LOADGEN_API_KEY ?? '',

  ingestBufferEnabled: process.env.INGEST_BUFFER_ENABLED !== "false",
  // Short interval so HTTP callers waiting on durable flush stay low-latency
  // when traffic is below flushBatchSize (timer-driven coalesce).
  flushIntervalMs: parseInt(process.env.FLUSH_INTERVAL_MS ?? "50", 10),
  // Full-size COPY batches under load; see ingest-buffer coalesce logic.
  flushBatchSize: parseInt(process.env.FLUSH_BATCH_SIZE ?? "5000", 10),
  // Parallel COPYs; keep below PG_POOL_MAX so query/agg still get connections.
  flushConcurrency: parseInt(process.env.FLUSH_CONCURRENCY ?? "4", 10),
  queueMaxSize: parseInt(process.env.QUEUE_MAX_SIZE ?? "500000", 10),
  // Max failed flush attempts for a given entry before its caller's request is failed (503).
  flushMaxRetries: parseInt(process.env.FLUSH_MAX_RETRIES ?? "5", 10),
};
