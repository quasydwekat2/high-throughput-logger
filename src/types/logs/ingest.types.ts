import type { LogEntry } from "./domain.types.js";

/** POST /logs — ingestion request/response contracts and insert strategies. */

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
export type IngestStrategyName = "copy" | "unnest" | "row-by-row";

/** Shared contract every ingest strategy must implement. */
export type InsertLogsStrategy = (logs: LogEntry[]) => Promise<void>;

/**
 * A log entry buffered in `IngestBuffer`, paired with the promise callbacks
 * that settle once its containing batch is durably flushed to Postgres (or
 * fails permanently after `FLUSH_MAX_RETRIES` attempts).
 */
export interface QueuedEntry {
  log: LogEntry;
  attempts: number;
  resolve: () => void;
  reject: (err: unknown) => void;
}
