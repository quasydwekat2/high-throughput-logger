import type { LogEntry } from "../../types/log.types.js";
import { getIngestStrategy } from "./ingest/select-strategy.js";

/**
 * Bulk-inserts a batch of validated log entries.
 * Strategy is selected in ingest/select-strategy.ts (one-line switch).
 */
export async function insertLogs(logs: LogEntry[]): Promise<void> {
  if (logs.length === 0) return;
  await getIngestStrategy()(logs);
}
