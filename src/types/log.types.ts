// ─── Core domain types ────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type BucketSize = '1m' | '5m' | '1h' | '1d';
export type GroupBy = 'service' | 'level';

export const VALID_LEVELS: ReadonlySet<string> = new Set(['debug', 'info', 'warn', 'error']);
export const VALID_BUCKETS: ReadonlySet<string> = new Set(['1m', '5m', '1h', '1d']);
export const VALID_GROUP_BY: ReadonlySet<string> = new Set(['service', 'level']);

// A validated log entry ready to be inserted
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  attributes: Record<string, string | number | boolean>;
}

// A log row returned from the database
export interface LogRow {
  id: string;
  timestamp: string;
  level: string;
  service: string;
  message: string;
  attributes: Record<string, string | number | boolean>;
}

// ─── Query params ─────────────────────────────────────────────────────────────

export interface Cursor {
  ts: string;
  id: string;
}

export interface QueryParams {
  service?: string;
  level?: string;
  since?: Date;
  until?: Date;
  attrs: Record<string, string>;
  q?: string;
  limit: number;
  cursor?: Cursor;
}

// ─── Aggregate params ─────────────────────────────────────────────────────────

export interface AggregateParams {
  since: Date;
  until: Date;
  bucket: BucketSize;
  group_by?: GroupBy;
  service?: string;
  level?: string;
  attrs: Record<string, string>;
  q?: string;
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface AggregationBucket {
  start: string;
  group: string | null;
  count: number;
}
