import { Pool } from "pg";
import { config } from "../config.js";

const poolDefaults = {
  connectionString: config.databaseUrl,
  idleTimeoutMillis: config.pgIdleTimeoutMs,
  connectionTimeoutMillis: config.pgConnectionTimeoutMs,
};

/** Ingest COPY + minute_rollup upsert. */
export const writePool = new Pool({
  ...poolDefaults,
  max: config.pgWritePoolMax,
});

/** GET /logs and GET /health only — never blocked by aggregate COUNT. */
export const queryPool = new Pool({
  ...poolDefaults,
  max: config.pgQueryPoolMax,
});

/** GET /logs/aggregate only. */
export const aggregatePool = new Pool({
  ...poolDefaults,
  max: config.pgAggregatePoolMax,
});

export async function endPools(): Promise<void> {
  await Promise.all([writePool.end(), queryPool.end(), aggregatePool.end()]);
}
