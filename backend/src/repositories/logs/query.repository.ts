import { queryPool } from "../../DB/client.js";
import type {
  ParsedQueryParams,
  StoredLogEntry,
  QueryLogsResponse,
  QueryLogRow,
  LogLevel,
} from "../../types/log.types.js";
import { encodeCursor } from "../../utils/cursor-pagination.util.js";
import { pushAttrContainment } from "../../utils/attr-filter.util.js";

/** UTC ISO-8601 with microseconds — JS Date only has millisecond precision. */
const TS_ISO_MICROS = `to_char(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export async function queryLogs(
  params: ParsedQueryParams,
): Promise<QueryLogsResponse> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let n = 1;

  // since/until only when the client sent them — do not inject a 30-day window.
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
  n = pushAttrContainment(conditions, values, n, params.attrs);

  // Next page in (timestamp DESC, id DESC): PK (timestamp, id) backward scan.
  if (params.cursor) {
    const tsPos = n++;
    const idPos = n++;
    conditions.push(
      `(timestamp, id) < ($${tsPos}::timestamptz, $${idPos}::bigint)`,
    );
    values.push(params.cursor.timestamp, params.cursor.id);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const fetchLimit = params.limit + 1;

  const sql = `
    SELECT id, ${TS_ISO_MICROS} AS ts_iso, level, service, message, attributes
    FROM logs
    ${where}
    ORDER BY timestamp DESC, id DESC
    LIMIT ${fetchLimit}
  `;

  const result = await queryPool.query<QueryLogRow>(sql, values);

  const rows: QueryLogRow[] = result.rows;
  let next_cursor: string | null = null;

  if (rows.length > params.limit) {
    rows.pop();
    const last = rows[rows.length - 1];
    next_cursor = encodeCursor(last.ts_iso, String(last.id));
  }

  const logs: StoredLogEntry[] = rows.map((row: QueryLogRow) => ({
    id: String(row.id),
    timestamp: row.ts_iso,
    level: row.level as LogLevel,
    service: row.service,
    message: row.message,
    attributes: row.attributes ?? {},
  }));

  return { logs, next_cursor };
}
