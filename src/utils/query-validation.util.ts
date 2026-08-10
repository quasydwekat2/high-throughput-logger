import type {
  AggregateLogsParams,
  ParsedQueryParams,
  ParsedAggregateParams,
  QueryLogsParams,
  BucketSize,
  GroupByOption,
  LogLevel,
} from '../types/log.types.js';
import {
  VALID_LEVELS,
  VALID_BUCKETS,
  VALID_GROUP_BY,
} from '../types/log.types.js';
import { decodeCursor } from './cursor-pagination.util.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function parseDate(
  value: string,
  name: string,
): { date: Date } | { error: string } {
  const ms = Date.parse(value);
  if (isNaN(ms))
    return { error: `invalid ${name}: must be a valid ISO 8601 timestamp` };
  return { date: new Date(ms) };
}

function extractAttrs(
  qs: QueryLogsParams | AggregateLogsParams,
): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [key, val] of Object.entries(qs)) {
    if (key.startsWith('attr.') && typeof val === 'string') {
      attrs[key.slice(5)] = val;
    }
  }
  return attrs;
}

// ─── GET /logs ────────────────────────────────────────────────────────────────

export function parseQueryParams(
  qs: QueryLogsParams,
): { params: ParsedQueryParams } | { error: string } {
  if (qs.level !== undefined && !VALID_LEVELS.has(qs.level)) {
    return { error: `invalid level: must be one of debug, info, warn, error` };
  }

  let since: Date | undefined;
  if (qs.since !== undefined) {
    const result = parseDate(qs.since, 'since');
    if ('error' in result) return result;
    since = result.date;
  }

  let until: Date | undefined;
  if (qs.until !== undefined) {
    const result = parseDate(qs.until, 'until');
    if ('error' in result) return result;
    until = result.date;
  }

  if (since !== undefined && until !== undefined && until <= since) {
    return { error: 'until must be later than since' };
  }

  let limit = 100;
  if (qs.limit !== undefined) {
    if (!/^\d+$/.test(qs.limit))
      return { error: 'limit must be a positive integer' };
    limit = parseInt(qs.limit, 10);
    if (limit < 1 || limit > 1000)
      return { error: 'limit must be between 1 and 1000' };
  }

  let cursor: ParsedQueryParams['cursor'];
  if (qs.cursor !== undefined) {
    const decoded = decodeCursor(qs.cursor);
    if (decoded === null) return { error: 'invalid or malformed cursor' };
    cursor = decoded;
  }

  return {
    params: {
      service: qs.service,
      level: qs.level as LogLevel | undefined,
      since,
      until,
      attrs: extractAttrs(qs),
      q: qs.q,
      limit,
      cursor,
    },
  };
}

// ─── GET /logs/aggregate ──────────────────────────────────────────────────────

export function parseAggregateParams(
  qs: AggregateLogsParams,
): { params: ParsedAggregateParams } | { error: string } {
  if (!qs.since) return { error: 'since is required' };
  const sinceResult = parseDate(qs.since, 'since');
  if ('error' in sinceResult) return sinceResult;

  if (!qs.until) return { error: 'until is required' };
  const untilResult = parseDate(qs.until, 'until');
  if ('error' in untilResult) return untilResult;

  if (untilResult.date <= sinceResult.date) {
    return { error: 'until must be later than since' };
  }

  if (!qs.bucket) return { error: 'bucket is required' };
  if (!VALID_BUCKETS.has(qs.bucket)) {
    return { error: 'bucket must be one of: 1m, 5m, 1h, 1d' };
  }

  if (qs.group_by !== undefined && !VALID_GROUP_BY.has(qs.group_by)) {
    return { error: 'group_by must be one of: service, level' };
  }

  if (qs.level !== undefined && !VALID_LEVELS.has(qs.level)) {
    return { error: 'invalid level: must be one of debug, info, warn, error' };
  }

  return {
    params: {
      since: sinceResult.date,
      until: untilResult.date,
      bucket: qs.bucket as BucketSize,
      group_by: qs.group_by as GroupByOption | undefined,
      service: qs.service,
      level: qs.level as LogLevel | undefined,
      attrs: extractAttrs(qs),
      q: qs.q,
    },
  };
}
