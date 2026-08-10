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

// ─── GET /logs (Query & Cursor Pagination Contract) ───────────────────────────

export interface QueryLogsParams {
  service?: string;
  level?: LogLevel;
  since?: string;
  until?: string;
  q?: string;
  limit?: number;
  cursor?: string;
  /** Dynamic attribute filters, e.g. attr.user_id=42 */
  [key: `attr.${string}`]: string | undefined;
}

export interface QueryLogsResponse {
  logs: StoredLogEntry[];
  next_cursor: string | null;
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
  since?: Date;
  until?: Date;
  attrs: Record<string, string>;
  q?: string;
  limit: number;
  cursor?: CursorPayload;
}

// ─── GET /logs/aggregate (Aggregation Contract) ───────────────────────────────

export type BucketSize = '1m' | '5m' | '1h' | '1d';
export type GroupByOption = 'service' | 'level';

export interface AggregateLogsParams {
  since: string;
  until: string;
  bucket: BucketSize;
  group_by?: GroupByOption;
  service?: string;
  level?: LogLevel;
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
