import { Pool } from 'pg';
import { config } from '../config.js';

const poolDefaults = {
  connectionString: config.databaseUrl,
  idleTimeoutMillis: config.pgIdleTimeoutMs,
  connectionTimeoutMillis: config.pgConnectionTimeoutMs,
};

/** Dedicated to ingest (COPY / INSERT). Kept small so reads stay responsive. */
export const writePool = new Pool({
  ...poolDefaults,
  max: config.pgWritePoolMax,
});

/** Dedicated to query, aggregate, and health checks. */
export const readPool = new Pool({
  ...poolDefaults,
  max: config.pgReadPoolMax,
});

export async function endPools(): Promise<void> {
  await Promise.all([writePool.end(), readPool.end()]);
}
