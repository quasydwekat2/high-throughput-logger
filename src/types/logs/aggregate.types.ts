import type { LogLevel } from './domain.types.js';

/** GET /logs/aggregate — bucketed aggregation contracts. */

export type BucketSize = '1m' | '5m' | '1h' | '1d';
export type GroupByOption = 'service' | 'level';

export const VALID_BUCKETS: ReadonlySet<string> = new Set([
  '1m',
  '5m',
  '1h',
  '1d',
]);
export const VALID_GROUP_BY: ReadonlySet<string> = new Set([
  'service',
  'level',
]);

/**
 * Raw GET /logs/aggregate query-string contract.
 * Required fields are validated at parse time (missing → 400).
 */
export interface AggregateLogsParams {
  since?: string;
  until?: string;
  /** One of: 1m, 5m, 1h, 1d */
  bucket?: string;
  /** One of: service, level */
  group_by?: string;
  service?: string;
  /** One of: debug, info, warn, error */
  level?: string;
  q?: string;
  [key: `attr.${string}`]: string | undefined;
}

export interface AggregateBucket {
  start: string;
  group: string | null;
  count: number;
}

export interface AggregateLogsResponse {
  buckets: AggregateBucket[];
}

/** Parsed GET /logs/aggregate params ready for the repository */
export interface ParsedAggregateParams {
  since: Date;
  until: Date;
  bucket: BucketSize;
  group_by?: GroupByOption;
  service?: string;
  level?: LogLevel;
  attrs: Record<string, string>;
  q?: string;
}
