// ─── Core domain types ────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type AttributeValue = string | number | boolean;

export interface LogAttributes {
  [key: string]: AttributeValue;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  attributes?: LogAttributes;
}

/** Entity as stored / retrieved from the database */
export interface StoredLogEntry extends LogEntry {
  id: string;
}

export const VALID_LEVELS: ReadonlySet<string> = new Set([
  'debug',
  'info',
  'warn',
  'error',
]);
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

// ─── POST /logs (Ingestion Contract) ──────────────────────────────────────────

export interface IngestLogsRequest {
  logs: LogEntry[];
}

export interface IngestionError {
  index: number;
  reason: string;
}

export interface IngestLogsResponse {
  accepted: number;
  rejected: IngestionError[];
}

/** Available bulk-insert strategies for log ingestion. */
export type IngestStrategyName = 'copy' | 'unnest' | 'row-by-row';

/** Shared contract every ingest strategy must implement. */
export type InsertLogsStrategy = (logs: LogEntry[]) => Promise<void>;

/** Pre-encoded COPY payload + rollup rows (built while a previous COPY runs). */
export interface EncodedCopyPayload {
  payload: string;
  rollupTimeBuckets: Date[];
  rollupServices: string[];
  rollupLevels: string[];
  rollupCounts: number[];
}

// ─── GET /logs (Query & Cursor Pagination Contract) ───────────────────────────

/** Raw GET /logs query-string contract (all values arrive as strings). */
export interface QueryLogsParams {
  service?: string;
  /** One of: debug, info, warn, error */
  level?: string;
  since?: string;
  until?: string;
  q?: string;
  limit?: string;
  cursor?: string;
  /** Dynamic attribute filters, e.g. attr.user_id=42 */
  [key: `attr.${string}`]: string | undefined;
}

export interface QueryLogsResponse {
  logs: StoredLogEntry[];
  next_cursor: string | null;
}

/** Row shape returned by GET /logs SQL (ts_iso preserves microseconds). */
export interface QueryLogRow {
  id: string;
  ts_iso: string;
  level: string;
  service: string;
  message: string;
  attributes: LogAttributes;
}

/** Decoded Base64URL cursor payload */
export interface CursorPayload {
  timestamp: string;
  id: string;
}

/** Parsed GET /logs params ready for the repository */
export interface ParsedQueryParams {
  service?: string;
  level?: LogLevel;
  /** Original ISO-8601 strings (microseconds preserved for timestamptz). */
  since?: string;
  until?: string;
  attrs: Record<string, string>;
  q?: string;
  limit: number;
  cursor?: CursorPayload;
}

// ─── GET /logs/aggregate (Aggregation Contract) ───────────────────────────────

export type BucketSize = '1m' | '5m' | '1h' | '1d';
export type GroupByOption = 'service' | 'level';

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

/** Row shape returned by GET /logs/aggregate SQL. */
export interface AggregateQueryRow {
  start: Date;
  group: string | null;
  count: number;
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
