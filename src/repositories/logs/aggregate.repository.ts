import { pool } from "../../DB/client.js";
import type {
  ParsedAggregateParams,
  AggregateBucket,
  BucketSize,
} from "../../types/logs/index.js";

// Maps bucket size to the SQL expression that truncates a timestamp to that bucket
function bucketExpr(size: BucketSize): string {
  switch (size) {
    case "1m":
      return `date_trunc('minute', timestamp)`;
    case "1h":
      return `date_trunc('hour', timestamp)`;
    case "1d":
      return `date_trunc('day', timestamp)`;
    case "5m":
      // floor(epoch / 300) * 300 gives the start of each 5-minute window
      return `to_timestamp(floor(extract(epoch from timestamp) / 300) * 300)`;
  }
}

export async function aggregateLogs(
  params: ParsedAggregateParams,
): Promise<AggregateBucket[]> {
  const conditions: string[] = [
    "timestamp >= $1::timestamptz",
    "timestamp < $2::timestamptz",
  ];
  const values: unknown[] = [params.since, params.until];
  let n = 3;

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

  const bucket = bucketExpr(params.bucket);
  const where = `WHERE ${conditions.join(" AND ")}`;

  let sql: string;

  if (params.group_by) {
    // group_by is whitelisted to 'service' | 'level' — safe to interpolate
    const col = params.group_by;
    sql = `
      SELECT
        ${bucket} AS start,
        ${col}    AS "group",
        COUNT(*)::int AS count
      FROM logs
      ${where}
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;
  } else {
    sql = `
      SELECT
        ${bucket}  AS start,
        NULL::text AS "group",
        COUNT(*)::int AS count
      FROM logs
      ${where}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }

  const result = await pool.query<{
    start: Date;
    group: string | null;
    count: number;
  }>(sql, values);

  return result.rows.map((row) => ({
    start: row.start.toISOString(),
    group: row.group,
    count: row.count,
  }));
}
