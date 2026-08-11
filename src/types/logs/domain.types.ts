/** Core log domain types shared across ingest, query, and storage. */

export type LogLevel = "debug" | "info" | "warn" | "error";

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
  "debug",
  "info",
  "warn",
  "error",
]);
