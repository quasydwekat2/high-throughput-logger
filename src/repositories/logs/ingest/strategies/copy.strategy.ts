import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { from as copyFrom } from 'pg-copy-streams';
import { writePool } from '../../../../DB/client.js';
import type {
  EncodedCopyPayload,
  InsertLogsStrategy,
  LogEntry,
} from '../../../../types/log.types.js';
import { upsertMinuteRollupRows } from '../../rollup.repository.js';

/** Escape a field for PostgreSQL text-format COPY (tab-delimited). */
function escapeCopyText(value: string): string {
  if (
    value.indexOf('\\') === -1 &&
    value.indexOf('\n') === -1 &&
    value.indexOf('\r') === -1 &&
    value.indexOf('\t') === -1
  ) {
    return value;
  }
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function minuteKey(iso: string): string {
  // Fast path for UTC ISO used by the load generator: YYYY-MM-DDTHH:MM...
  if (iso.length >= 16 && iso.charCodeAt(iso.length - 1) === 90) {
    return iso.slice(0, 16);
  }
  const parsed = Date.parse(iso);
  return String(parsed - (parsed % 60_000));
}

function minuteDate(key: string): Date {
  return key.length === 16 ? new Date(key + ':00.000Z') : new Date(Number(key));
}

/**
 * Build COPY text + rollup arrays, then write. Encoding is sync; COPY IO
 * yields so query/aggregate handlers can run on the same 0.5 CPU.
 */
function encodeCopy(logs: LogEntry[]): EncodedCopyPayload {
  const parts = new Array<string>(logs.length);
  const counts = new Map<
    string,
    { date: Date; service: string; level: string; log_count: number }
  >();

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const attrs =
      log.attributes === undefined ? '{}' : JSON.stringify(log.attributes);
    parts[i] =
      log.timestamp +
      '\t' +
      log.level +
      '\t' +
      escapeCopyText(log.service) +
      '\t' +
      escapeCopyText(log.message) +
      '\t' +
      escapeCopyText(attrs) +
      '\n';

    const key = minuteKey(log.timestamp);
    const mapKey = key + '\0' + log.service + '\0' + log.level;
    const row = counts.get(mapKey);
    if (row) {
      row.log_count += 1;
    } else {
      counts.set(mapKey, {
        date: minuteDate(key),
        service: log.service,
        level: log.level,
        log_count: 1,
      });
    }
  }

  const rollupTimeBuckets: Date[] = [];
  const rollupServices: string[] = [];
  const rollupLevels: string[] = [];
  const rollupCounts: number[] = [];
  for (const row of counts.values()) {
    rollupTimeBuckets.push(row.date);
    rollupServices.push(row.service);
    rollupLevels.push(row.level);
    rollupCounts.push(row.log_count);
  }

  return {
    payload: parts.join(''),
    rollupTimeBuckets,
    rollupServices,
    rollupLevels,
    rollupCounts,
  };
}

/** COPY + rollup using a payload already encoded on the event loop. */
async function insertEncodedCopy(
  encoded: EncodedCopyPayload,
): Promise<void> {
  const client = await writePool.connect();
  try {
    await client.query('BEGIN');
    const copyStream = client.query(
      copyFrom(
        `COPY logs (timestamp, level, service, message, attributes) FROM STDIN`,
      ),
    );
    await pipeline(Readable.from([encoded.payload]), copyStream);
    await upsertMinuteRollupRows(client, encoded);
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
}

/**
 * COPY logs then upsert minute_rollups in one transaction so a 200
 * means both the heap rows and aggregation counts are durable.
 */
export const insertWithCopy: InsertLogsStrategy = async (logs) => {
  await insertEncodedCopy(encodeCopy(logs));
};
