import type { QueryParams, AggregateParams, BucketSize, GroupBy } from '../types/log.types.js';
import { VALID_LEVELS, VALID_BUCKETS, VALID_GROUP_BY } from '../types/log.types.js';
import { decodeCursor } from './cursor.util.js';

type RawQS = Record<string, string | string[] | undefined>;

// ─── Shared helpers ───────────────────────────────────────────────────────────

function parseDate(value: string, name: string): { date: Date } | { error: string } {
  const ms = Date.parse(value);
  if (isNaN(ms)) return { error: `invalid ${name}: must be a valid ISO 8601 timestamp` };
  return { date: new Date(ms) };
}

function extractAttrs(qs: RawQS): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [key, val] of Object.entries(qs)) {
    if (key.startsWith('attr.') && typeof val === 'string') {
      attrs[key.slice(5)] = val;
    }
  }
  return attrs;
}

function scalar(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

// ─── GET /logs ────────────────────────────────────────────────────────────────

export function parseQueryParams(qs: RawQS): { params: QueryParams } | { error: string } {
  // level
  const rawLevel = scalar(qs['level']);
  if (rawLevel !== undefined && !VALID_LEVELS.has(rawLevel)) {
    return { error: `invalid level: must be one of debug, info, warn, error` };
  }

  // since
  let since: Date | undefined;
  const rawSince = scalar(qs['since']);
  if (rawSince !== undefined) {
    const result = parseDate(rawSince, 'since');
    if ('error' in result) return result;
    since = result.date;
  }

  // until
  let until: Date | undefined;
  const rawUntil = scalar(qs['until']);
  if (rawUntil !== undefined) {
    const result = parseDate(rawUntil, 'until');
    if ('error' in result) return result;
    until = result.date;
  }

  if (since !== undefined && until !== undefined && until <= since) {
    return { error: 'until must be later than since' };
  }

  // limit
  const rawLimit = scalar(qs['limit']);
  let limit = 100;
  if (rawLimit !== undefined) {
    if (!/^\d+$/.test(rawLimit)) return { error: 'limit must be a positive integer' };
    limit = parseInt(rawLimit, 10);
    if (limit < 1 || limit > 1000) return { error: 'limit must be between 1 and 1000' };
  }

  // cursor
  const rawCursor = scalar(qs['cursor']);
  let cursor: QueryParams['cursor'];
  if (rawCursor !== undefined) {
    const decoded = decodeCursor(rawCursor);
    if (decoded === null) return { error: 'invalid or malformed cursor' };
    cursor = decoded;
  }

  return {
    params: {
      service: scalar(qs['service']),
      level: rawLevel,
      since,
      until,
      attrs: extractAttrs(qs),
      q: scalar(qs['q']),
      limit,
      cursor,
    },
  };
}

// ─── GET /logs/aggregate ──────────────────────────────────────────────────────

export function parseAggregateParams(qs: RawQS): { params: AggregateParams } | { error: string } {
  // since (required)
  const rawSince = scalar(qs['since']);
  if (!rawSince) return { error: 'since is required' };
  const sinceResult = parseDate(rawSince, 'since');
  if ('error' in sinceResult) return sinceResult;

  // until (required)
  const rawUntil = scalar(qs['until']);
  if (!rawUntil) return { error: 'until is required' };
  const untilResult = parseDate(rawUntil, 'until');
  if ('error' in untilResult) return untilResult;

  if (untilResult.date <= sinceResult.date) {
    return { error: 'until must be later than since' };
  }

  // bucket (required)
  const rawBucket = scalar(qs['bucket']);
  if (!rawBucket) return { error: 'bucket is required' };
  if (!VALID_BUCKETS.has(rawBucket)) {
    return { error: 'bucket must be one of: 1m, 5m, 1h, 1d' };
  }

  // group_by (optional)
  const rawGroupBy = scalar(qs['group_by']);
  if (rawGroupBy !== undefined && !VALID_GROUP_BY.has(rawGroupBy)) {
    return { error: 'group_by must be one of: service, level' };
  }

  // level (optional filter)
  const rawLevel = scalar(qs['level']);
  if (rawLevel !== undefined && !VALID_LEVELS.has(rawLevel)) {
    return { error: 'invalid level: must be one of debug, info, warn, error' };
  }

  return {
    params: {
      since: sinceResult.date,
      until: untilResult.date,
      bucket: rawBucket as BucketSize,
      group_by: rawGroupBy as GroupBy | undefined,
      service: scalar(qs['service']),
      level: rawLevel,
      attrs: extractAttrs(qs),
      q: scalar(qs['q']),
    },
  };
}
