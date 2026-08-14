import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { from as copyFrom } from 'pg-copy-streams';
import { writePool } from '../../../../DB/client.js';
import type { LogEntry } from '../../../../types/log.types.js';
import type { InsertLogsStrategy } from '../../../../types/log.types.js';
import { upsertMinuteRollups } from '../../rollup.repository.js';

/** Escape a field for PostgreSQL text-format COPY (tab-delimited). */
function escapeCopyText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function toCopyRow(log: LogEntry): string {
  return (
    [
      escapeCopyText(log.timestamp),
      escapeCopyText(log.level),
      escapeCopyText(log.service),
      escapeCopyText(log.message),
      escapeCopyText(JSON.stringify(log.attributes ?? {})),
    ].join('\t') + '\n'
  );
}

/**
 * COPY logs then upsert minute_rollups in one transaction so a 200
 * means both the heap rows and aggregation counts are durable.
 */
export const insertWithCopy: InsertLogsStrategy = async (logs) => {
  const client = await writePool.connect();
  try {
    await client.query('BEGIN');
    const copyStream = client.query(
      copyFrom(
        `COPY logs (timestamp, level, service, message, attributes) FROM STDIN`,
      ),
    );
    const source = Readable.from(logs.map(toCopyRow));
    await pipeline(source, copyStream);
    await upsertMinuteRollups(client, logs);
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // connection may already be dead
    }
    throw err;
  } finally {
    client.release();
  }
};
