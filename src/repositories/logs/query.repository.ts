import { pool } from '../../DB/client.js';
import type {
  ParsedQueryParams,
  StoredLogEntry,
  QueryLogsResponse,
  LogLevel,
  LogAttributes,
} from '../../types/log.types.js';
import { encodeCursor } from '../../utils/cursor.util.js';

export async function queryLogs(params: ParsedQueryParams): Promise<QueryLogsResponse> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let n = 1;

  if (params.since) {
    conditions.push(`timestamp >= $${n++}::timestamptz`);
    values.push(params.since);
  }
  if (params.until) {
    conditions.push(`timestamp < $${n++}::timestamptz`);
    values.push(params.until);
  }
  if (params.service) {
    conditions.push(`service = $${n++}`);
    values.push(params.service);
  }
  if (params.level) {
    conditions.push(`level = $${n++}`);
    values.push(params.level);
  }
  if (params.q) {
    conditions.push(`message ILIKE $${n++}`);
    values.push(`%${params.q}%`);
  }
  for (const [key, val] of Object.entries(params.attrs)) {
    conditions.push(`attributes @> $${n++}::jsonb`);
    values.push(JSON.stringify({ [key]: val }));
  }

  // Cursor: rows that come AFTER cursor in (timestamp DESC, id DESC) order
  if (params.cursor) {
    const tsPos = n++;
    const idPos = n++;
    conditions.push(
      `(timestamp < $${tsPos}::timestamptz OR (timestamp = $${tsPos}::timestamptz AND id < $${idPos}::bigint))`,
    );
    values.push(params.cursor.timestamp, params.cursor.id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Fetch one extra row to determine whether a next page exists
  const fetchLimit = params.limit + 1;

  const sql = `
    SELECT id, timestamp, level, service, message, attributes
    FROM logs
    ${where}
    ORDER BY timestamp DESC, id DESC
    LIMIT ${fetchLimit}
  `;

  const result = await pool.query<{
    id: string;
    timestamp: Date;
    level: string;
    service: string;
    message: string;
    attributes: LogAttributes;
  }>(sql, values);

  const rows = result.rows;
  let next_cursor: string | null = null;

  if (rows.length > params.limit) {
    rows.pop();
    const last = rows[rows.length - 1];
    next_cursor = encodeCursor(last.timestamp.toISOString(), String(last.id));
  }

  const logs: StoredLogEntry[] = rows.map((row) => ({
    id: String(row.id),
    timestamp: row.timestamp.toISOString(),
    level: row.level as LogLevel,
    service: row.service,
    message: row.message,
    attributes: row.attributes ?? {},
  }));

  return { logs, next_cursor };
}
