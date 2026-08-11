import { Pool } from "pg";
import { config } from "../config.js";

const sharedOpts = {
  connectionString: config.databaseUrl,
  idleTimeoutMillis: config.pgIdleTimeoutMs,
  connectionTimeoutMillis: config.pgConnectionTimeoutMs,
};

/**
 * Write pool — COPY / ingest only.
 * Sized for FLUSH_CONCURRENCY (+ small margin) so writers cannot starve readers.
 */
export const writePool = new Pool({
  ...sharedOpts,
  max: config.pgWritePoolMax,
});

/**
 * Read pool — query, aggregate, health.
 * Reserved connections so ingest COPY never blocks visibility / agg under load.
 */
export const readPool = new Pool({
  ...sharedOpts,
  max: config.pgReadPoolMax,
});

/** @deprecated Prefer writePool / readPool. Kept as write alias for older call sites. */
export const pool = writePool;

export async function closePools(): Promise<void> {
  await Promise.all([writePool.end(), readPool.end()]);
}
