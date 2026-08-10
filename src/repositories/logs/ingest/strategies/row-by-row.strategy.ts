import { pool } from '../../../../DB/client.js';
import type { InsertLogsStrategy } from '../../../../types/logs/index.js';

/**
 * One INSERT per row inside a single transaction.
 * Slowest option — useful as a baseline for benchmarks.
 */
export const insertRowByRow: InsertLogsStrategy = async (logs) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const log of logs) {
      await client.query(
        `INSERT INTO logs (timestamp, level, service, message, attributes)
         VALUES ($1::timestamptz, $2, $3, $4, $5::jsonb)`,
        [
          log.timestamp,
          log.level,
          log.service,
          log.message,
          JSON.stringify(log.attributes ?? {}),
        ],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
