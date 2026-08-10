import { pool } from '../../../../DB/client.js';
import type { InsertLogsStrategy } from '../../../../types/log.types.js';

/**
 * Single INSERT … SELECT * FROM unnest(...) with typed arrays.
 * One round-trip regardless of batch size.
 */
export const insertWithUnnest: InsertLogsStrategy = async (logs) => {
  const timestamps = logs.map((l) => l.timestamp);
  const levels = logs.map((l) => l.level);
  const services = logs.map((l) => l.service);
  const messages = logs.map((l) => l.message);
  const attributes = logs.map((l) => JSON.stringify(l.attributes ?? {}));

  await pool.query(
    `INSERT INTO logs (timestamp, level, service, message, attributes)
     SELECT * FROM unnest(
       $1::timestamptz[],
       $2::text[],
       $3::text[],
       $4::text[],
       $5::jsonb[]
     )`,
    [timestamps, levels, services, messages, attributes],
  );
};
