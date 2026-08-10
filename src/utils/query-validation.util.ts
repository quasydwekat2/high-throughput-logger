import type {
  AggregateLogsParams,
  ParsedQueryParams,
  ParsedAggregateParams,
  QueryLogsParams,
  BucketSize,
  GroupByOption,
  LogLevel,
} from '../types/logs/index.js';
import {
  VALID_LEVELS,
  VALID_BUCKETS,
  VALID_GROUP_BY,
} from '../types/logs/index.js';
import { ValidationError } from '../types/error.middleware/index.js';
import { decodeCursor } from './cursor-pagination.util.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function parseDate(value: string, name: string): Date {
  const ms = Date.parse(value);
  if (isNaN(ms)) {
    throw new ValidationError(
      `invalid ${name}: must be a valid ISO 8601 timestamp`,
    );
  }
  return new Date(ms);
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

export function parseQueryParams(qs: QueryLogsParams): ParsedQueryParams {
  if (qs.level !== undefined && !VALID_LEVELS.has(qs.level)) {
    throw new ValidationError(
      'invalid level: must be one of debug, info, warn, error',
    );
  }

  const since =
    qs.since !== undefined ? parseDate(qs.since, 'since') : undefined;
  const until =
    qs.until !== undefined ? parseDate(qs.until, 'until') : undefined;

  if (since !== undefined && until !== undefined && until <= since) {
    throw new ValidationError('until must be later than since');
  }

  let limit = 100;
  if (qs.limit !== undefined) {
    if (!/^\d+$/.test(qs.limit)) {
      throw new ValidationError('limit must be a positive integer');
    }
    limit = parseInt(qs.limit, 10);
    if (limit < 1 || limit > 1000) {
      throw new ValidationError('limit must be between 1 and 1000');
    }
  }

  let cursor: ParsedQueryParams['cursor'];
  if (qs.cursor !== undefined) {
    const decoded = decodeCursor(qs.cursor);
    if (decoded === null) {
      throw new ValidationError('invalid or malformed cursor');
    }
    cursor = decoded;
  }

  return {
    service: qs.service,
    level: qs.level as LogLevel | undefined,
    since,
    until,
    attrs: extractAttrs(qs),
    q: qs.q,
    limit,
    cursor,
  };
}

// ─── GET /logs/aggregate ──────────────────────────────────────────────────────

export function parseAggregateParams(
  qs: AggregateLogsParams,
): ParsedAggregateParams {
  if (!qs.since) throw new ValidationError('since is required');
  const since = parseDate(qs.since, 'since');

  if (!qs.until) throw new ValidationError('until is required');
  const until = parseDate(qs.until, 'until');

  if (until <= since) {
    throw new ValidationError('until must be later than since');
  }

  if (!qs.bucket) throw new ValidationError('bucket is required');
  if (!VALID_BUCKETS.has(qs.bucket)) {
    throw new ValidationError('bucket must be one of: 1m, 5m, 1h, 1d');
  }

  if (qs.group_by !== undefined && !VALID_GROUP_BY.has(qs.group_by)) {
    throw new ValidationError('group_by must be one of: service, level');
  }

  if (qs.level !== undefined && !VALID_LEVELS.has(qs.level)) {
    throw new ValidationError(
      'invalid level: must be one of debug, info, warn, error',
    );
  }

  return {
    since,
    until,
    bucket: qs.bucket as BucketSize,
    group_by: qs.group_by as GroupByOption | undefined,
    service: qs.service,
    level: qs.level as LogLevel | undefined,
    attrs: extractAttrs(qs),
    q: qs.q,
  };
}
