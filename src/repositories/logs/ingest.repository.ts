import type { LogEntry } from "../../types/logs/index.js";
import { getIngestStrategy } from "./ingest/select-strategy.js";

/**
 * Bulk-inserts a batch of validated log entries.
 * Active strategy is selected in ingest/select-strategy.ts (default: COPY).
 */
export async function insertLogs(logs: LogEntry[]): Promise<void> {
  if (logs.length === 0) return;
  await getIngestStrategy()(logs);
}
