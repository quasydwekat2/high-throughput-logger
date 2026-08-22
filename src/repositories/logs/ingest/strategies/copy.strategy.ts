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

const TAB = 0x09;
const NL = 0x0a;
const EMPTY_JSON = '{}';

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

function minuteBucket(iso: string): string {
  // Load-gen UTC ISO: YYYY-MM-DDTHH:MM:SS.sssZ — truncate to minute.
  if (iso.length >= 16 && iso.charCodeAt(iso.length - 1) === 90) {
    return iso.slice(0, 16) + ':00.000Z';
  }
  const parsed = Date.parse(iso);
  return new Date(parsed - (parsed % 60_000)).toISOString();
}

function grow(buf: Buffer, offset: number, needed: number): Buffer {
  if (offset + needed <= buf.length) return buf;
  let cap = buf.length * 2;
  while (cap < offset + needed) cap *= 2;
  const next: Buffer = Buffer.allocUnsafe(cap);
  buf.copy(next, 0, 0, offset);
  return next;
}

/**
 * Encode logs into COPY text + rollup keys. Called per HTTP batch so the
 * event loop is never blocked on a multi-thousand-row encode during flush.
 */
export function encodeCopyBatch(logs: LogEntry[]): EncodedCopyPayload {
  let buf: Buffer = Buffer.allocUnsafe(Math.max(8192, logs.length * 384));
  let o = 0;

  const counts = new Map<
    string,
    { bucket: string; service: string; level: string; log_count: number }
  >();

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const attrs =
      log.attributes === undefined ? EMPTY_JSON : JSON.stringify(log.attributes);
    const service = escapeCopyText(log.service);
    const message = escapeCopyText(log.message);
    const attrField = escapeCopyText(attrs);

    const rowBytes =
      Buffer.byteLength(log.timestamp) +
      1 +
      Buffer.byteLength(log.level) +
      1 +
      Buffer.byteLength(service) +
      1 +
      Buffer.byteLength(message) +
      1 +
      Buffer.byteLength(attrField) +
      1;

    buf = grow(buf, o, rowBytes);
    o += buf.write(log.timestamp, o);
    buf[o++] = TAB;
    o += buf.write(log.level, o);
    buf[o++] = TAB;
    o += buf.write(service, o);
    buf[o++] = TAB;
    o += buf.write(message, o);
    buf[o++] = TAB;
    o += buf.write(attrField, o);
    buf[o++] = NL;

    const bucket = minuteBucket(log.timestamp);
    const mapKey = bucket + '\0' + log.service + '\0' + log.level;
    const row = counts.get(mapKey);
    if (row) {
      row.log_count += 1;
    } else {
      counts.set(mapKey, {
        bucket,
        service: log.service,
        level: log.level,
        log_count: 1,
      });
    }
  }

  const rollupTimeBuckets: string[] = [];
  const rollupServices: string[] = [];
  const rollupLevels: string[] = [];
  const rollupCounts: number[] = [];
  for (const row of counts.values()) {
    rollupTimeBuckets.push(row.bucket);
    rollupServices.push(row.service);
    rollupLevels.push(row.level);
    rollupCounts.push(row.log_count);
  }

  return {
    copyText: buf.subarray(0, o),
    rowCount: logs.length,
    rollupTimeBuckets,
    rollupServices,
    rollupLevels,
    rollupCounts,
  };
}

export function mergeCopyPayloads(
  parts: EncodedCopyPayload[],
): EncodedCopyPayload {
  if (parts.length === 1) return parts[0];

  const counts = new Map<
    string,
    { bucket: string; service: string; level: string; log_count: number }
  >();
  let rows = 0;
  const buffers = new Array<Buffer>(parts.length);

  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    buffers[p] = part.copyText;
    rows += part.rowCount;
    for (let i = 0; i < part.rollupCounts.length; i++) {
      const bucket = part.rollupTimeBuckets[i];
      const service = part.rollupServices[i];
      const level = part.rollupLevels[i];
      const mapKey = bucket + '\0' + service + '\0' + level;
      const row = counts.get(mapKey);
      if (row) {
        row.log_count += part.rollupCounts[i];
      } else {
        counts.set(mapKey, {
          bucket,
          service,
          level,
          log_count: part.rollupCounts[i],
        });
      }
    }
  }

  const rollupTimeBuckets: string[] = [];
  const rollupServices: string[] = [];
  const rollupLevels: string[] = [];
  const rollupCounts: number[] = [];
  for (const row of counts.values()) {
    rollupTimeBuckets.push(row.bucket);
    rollupServices.push(row.service);
    rollupLevels.push(row.level);
    rollupCounts.push(row.log_count);
  }

  return {
    copyText: Buffer.concat(buffers),
    rowCount: rows,
    rollupTimeBuckets,
    rollupServices,
    rollupLevels,
    rollupCounts,
  };
}

export async function insertEncodedCopy(
  encoded: EncodedCopyPayload,
): Promise<void> {
  if (encoded.rowCount === 0) return;

  const client = await writePool.connect();
  try {
    await client.query('BEGIN');
    const copyStream = client.query(
      copyFrom(
        `COPY logs (timestamp, level, service, message, attributes) FROM STDIN`,
      ),
    );
    await pipeline(Readable.from([encoded.copyText]), copyStream);
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
  await insertEncodedCopy(encodeCopyBatch(logs));
};
