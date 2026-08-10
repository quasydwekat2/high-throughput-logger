import type { LogLevel, StoredLogEntry } from './domain.types.js';

/** GET /logs — query-string, cursor pagination, and parsed params. */

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
