import path from "node:path";
import dotenv from "dotenv";

// Compose injects env. Local `npm run dev` from backend/ reads repo-root .env.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

export const config = {
  // App
  port: parseInt(process.env.PORT ?? "8080", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",

  databaseUrl: resolveDatabaseUrl(),
  pgWritePoolMax: parseInt(process.env.PG_WRITE_POOL_MAX ?? "1", 10),
  pgQueryPoolMax: parseInt(process.env.PG_QUERY_POOL_MAX ?? "1", 10),
  pgAggregatePoolMax: parseInt(process.env.PG_AGGREGATE_POOL_MAX ?? "1", 10),
  pgIdleTimeoutMs: parseInt(process.env.PG_IDLE_TIMEOUT_MS ?? "30000", 10),
  pgConnectionTimeoutMs: parseInt(
    process.env.PG_CONNECTION_TIMEOUT_MS ?? "15000",
    10,
  ),

  // enqueue() awaits durable flush — coalesces concurrent POSTs into bulk COPY.
  ingestBufferEnabled: process.env.INGEST_BUFFER_ENABLED !== "false",
  flushIntervalMs: parseInt(process.env.FLUSH_INTERVAL_MS ?? "2", 10),
  flushBatchSize: parseInt(process.env.FLUSH_BATCH_SIZE ?? "1000", 10),
  flushConcurrency: parseInt(process.env.FLUSH_CONCURRENCY ?? "1", 10),
  queueMaxSize: parseInt(process.env.QUEUE_MAX_SIZE ?? "100000", 10),

  /**
   * How long to keep log partitions. Applied to pg_partman at startup.
   * Default 30 days. Invalid or non-positive values fall back to 30.
   */
  retentionDays: parseRetentionDays(process.env.RETENTION_DAYS),
};

function parseRetentionDays(raw: string | undefined): number {
  const n = parseInt(raw ?? "30", 10);
  if (!Number.isFinite(n) || n < 1) return 30;
  return n;
}

/**
 * Compose injects DATABASE_URL with host `postgres`.
 * `npm run dev` uses localhost — always take user/password from POSTGRES_*
 * so a stale DATABASE_URL password cannot disagree with the container.
 */
function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL;
  const local = !fromEnv || /@(localhost|127\.0\.0\.1)(?::|\/)/.test(fromEnv);

  if (!local && fromEnv) return fromEnv;

  const user = process.env.POSTGRES_USER ?? "postgres";
  const password = process.env.POSTGRES_PASSWORD ?? "your_password_here";
  const db = process.env.POSTGRES_DB ?? "log_ingestion_db";
  const port = process.env.POSTGRES_PORT ?? "5432";
  return `postgresql://${user}:${password}@localhost:${port}/${db}`;
}
