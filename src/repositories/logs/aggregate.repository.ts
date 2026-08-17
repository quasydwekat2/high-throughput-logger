import { aggregatePool } from '../../DB/client.js';
import type {
  ParsedAggregateParams,
  AggregateBucket,
  AggregateQueryRow,
  BucketSize,
} from '../../types/log.types.js';
import { pushAttrContainment } from '../../utils/attr-filter.util.js';

function bucketExpr(column: string, size: BucketSize): string {
  switch (size) {
    case '1m':
      return `date_trunc('minute', ${column})`;
    case '1h':
      return `date_trunc('hour', ${column})`;
    case '1d':
      return `date_trunc('day', ${column})`;
    case '5m':
      return `to_timestamp(floor(extract(epoch from ${column}) / 300) * 300)`;
  }
}

function canUseRollups(params: ParsedAggregateParams): boolean {
  return !params.q && Object.keys(params.attrs).length === 0;
}

async function aggregateFromRollups(
  params: ParsedAggregateParams,
): Promise<AggregateBucket[]> {
  const bucket = bucketExpr('time_bucket', params.bucket);
  const conditions: string[] = [
    `time_bucket >= date_trunc('minute', $1::timestamptz)`,
    `time_bucket < $2::timestamptz`,
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

  const where = `WHERE ${conditions.join(' AND ')}`;
  const groupCol = params.group_by;
  const sql = groupCol
    ? `
      SELECT
        ${bucket} AS start,
        ${groupCol} AS "group",
        SUM(log_count)::int AS count
      FROM minute_rollups
      ${where}
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `
    : `
      SELECT
        ${bucket} AS start,
        NULL::text AS "group",
        SUM(log_count)::int AS count
      FROM minute_rollups
      ${where}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

  const result = await aggregatePool.query<AggregateQueryRow>(sql, values);

  return result.rows.map((row: AggregateQueryRow) => ({
    start: row.start.toISOString(),
    group: row.group,
    count: row.count,
  }));
}

async function aggregateFromLogs(
  params: ParsedAggregateParams,
): Promise<AggregateBucket[]> {
  const conditions: string[] = [
    'timestamp >= $1::timestamptz',
    'timestamp < $2::timestamptz',
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
  pushAttrContainment(conditions, values, n, params.attrs);

  const bucket = bucketExpr('timestamp', params.bucket);
  const where = `WHERE ${conditions.join(' AND ')}`;
  const col = params.group_by;
  const sql = col
    ? `
      SELECT
        ${bucket} AS start,
        ${col}    AS "group",
        COUNT(*)::int AS count
      FROM logs
      ${where}
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `
    : `
      SELECT
        ${bucket}  AS start,
        NULL::text AS "group",
        COUNT(*)::int AS count
      FROM logs
      ${where}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

  const result = await aggregatePool.query<AggregateQueryRow>(sql, values);

  return result.rows.map((row: AggregateQueryRow) => ({
    start: row.start.toISOString(),
    group: row.group,
    count: row.count,
  }));
}

export async function aggregateLogs(
  params: ParsedAggregateParams,
): Promise<AggregateBucket[]> {
  if (canUseRollups(params)) {
    return aggregateFromRollups(params);
  }
  return aggregateFromLogs(params);
}
