import { config } from '../../config.js';
import { readPool } from '../../DB/client.js';
import type {
  ParsedQueryParams,
  StoredLogEntry,
  QueryLogsResponse,
  LogLevel,
  LogAttributes,
} from '../../types/log.types.js';
import { encodeCursor } from '../../utils/cursor-pagination.util.js';

export async function queryLogs(
  params: ParsedQueryParams,
): Promise<QueryLogsResponse> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let n = 1;

  // Partition pruning: always bound timestamp so Postgres skips cold partitions.
  // Matches retention when `since` is omitted (semantically "all retained rows").
  const since =
    params.since ??
    new Date(Date.now() - config.retentionDays * 24 * 60 * 60 * 1000);
  // Spec allows timestamps up to 5 minutes in the future.
  const until = params.until ?? new Date(Date.now() + 5 * 60 * 1000);

  conditions.push(`timestamp >= $${n++}::timestamptz`);
  values.push(since);
  conditions.push(`timestamp < $${n++}::timestamptz`);
  values.push(until);

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

  const where = `WHERE ${conditions.join(' AND ')}`;

  // Fetch one extra row to determine whether a next page exists
  const fetchLimit = params.limit + 1;

  // Uses idx_logs_service_level_ts / idx_logs_level_ts when filters match;
  // timestamp bounds enable partition pruning on RANGE(timestamp).
  const sql = `
    SELECT id, timestamp, level, service, message, attributes
    FROM logs
    ${where}
    ORDER BY timestamp DESC, id DESC
    LIMIT ${fetchLimit}
  `;

  const result = await readPool.query<{
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
