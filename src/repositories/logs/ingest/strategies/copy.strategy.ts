import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { from as copyFrom } from "pg-copy-streams";
import { pool } from "../../../../DB/client.js";
import type { LogEntry } from "../../../../types/logs/index.js";
import type { InsertLogsStrategy } from "../../../../types/logs/index.js";

/** Escape a field for PostgreSQL text-format COPY (tab-delimited). */
function escapeCopyText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function toCopyRow(log: LogEntry): string {
  return (
    [
      escapeCopyText(log.timestamp),
      escapeCopyText(log.level),
      escapeCopyText(log.service),
      escapeCopyText(log.message),
      escapeCopyText(JSON.stringify(log.attributes ?? {})),
    ].join("\t") + "\n"
  );
}

/**
 * Stream rows into Postgres via COPY FROM STDIN.
 * Fastest option for large batches.
 */
export const insertWithCopy: InsertLogsStrategy = async (logs) => {
  const client = await pool.connect();
  try {
    const copyStream = client.query(
      copyFrom(
        `COPY logs (timestamp, level, service, message, attributes) FROM STDIN`,
      ),
    );
    const source = Readable.from(logs.map(toCopyRow));
    await pipeline(source, copyStream);
  } finally {
    client.release();
  }
};
