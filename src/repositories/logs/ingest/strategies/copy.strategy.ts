import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { from as copyFrom } from "pg-copy-streams";
import { writePool } from "../../../../DB/client.js";
import type { LogEntry } from "../../../../types/logs/index.js";
import type { InsertLogsStrategy } from "../../../../types/logs/index.js";

const NEEDS_ESCAPE = /[\\\n\r\t]/;

/** Escape a field for PostgreSQL text-format COPY (tab-delimited). */
function escapeCopyText(value: string): string {
  // Hot path: synthetic / typical log fields need no escaping.
  if (!NEEDS_ESCAPE.test(value)) return value;
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function toCopyRow(log: LogEntry): string {
  const attrsJson = JSON.stringify(log.attributes ?? {});

  return (
    escapeCopyText(log.timestamp) +
    "\t" +
    escapeCopyText(log.level) +
    "\t" +
    escapeCopyText(log.service) +
    "\t" +
    escapeCopyText(log.message) +
    "\t" +
    escapeCopyText(attrsJson) +
    "\n"
  );
}

/**
 * Stream rows into Postgres via COPY FROM STDIN (writePool).
 * Fastest option for large batches — currently the active strategy.
 * Rows are yielded in chunks so we don't allocate one giant string up front
 * (matters under the 256 MB app memory limit).
 */
export const insertWithCopy: InsertLogsStrategy = async (logs) => {
  const client = await writePool.connect();
  try {
    const copyStream = client.query(
      copyFrom(
        `COPY logs (timestamp, level, service, message, attributes) FROM STDIN`,
      ),
    );

    // Yield multi-row chunks to cut stream overhead vs one yield per log.
    async function* rows(): AsyncGenerator<string> {
      const chunkSize = 256;
      let buf = "";
      let n = 0;
      for (const log of logs) {
        buf += toCopyRow(log);
        n += 1;
        if (n >= chunkSize) {
          yield buf;
          buf = "";
          n = 0;
        }
      }
      if (n > 0) yield buf;
    }

    await pipeline(Readable.from(rows()), copyStream);
  } finally {
    client.release();
  }
};
