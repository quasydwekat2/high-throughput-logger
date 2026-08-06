import { Pool } from 'pg';
import { config } from '../config.js';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.pgPoolMax,
  idleTimeoutMillis: config.pgIdleTimeoutMs,
  connectionTimeoutMillis: config.pgConnectionTimeoutMs,
});
