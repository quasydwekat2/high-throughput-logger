import type { PoolClient } from 'pg';
import type { LogEntry } from '../../types/log.types.js';

function minuteBucketUtc(iso: string): Date {
  const d = new Date(iso);
  d.setUTCSeconds(0, 0);
  d.setUTCMilliseconds(0);
  return d;
}

/**
 * Increment per-minute (service, level) counts for a COPY batch.
 * Must run on the same client/transaction as the COPY.
 */
export async function upsertMinuteRollups(
  client: PoolClient,
  logs: LogEntry[],
): Promise<void> {
  if (logs.length === 0) return;

  const counts = new Map<
    string,
    { time_bucket: Date; service: string; level: string; log_count: number }
  >();

  for (const log of logs) {
    const time_bucket = minuteBucketUtc(log.timestamp);
    const key = `${time_bucket.toISOString()}\0${log.service}\0${log.level}`;
    const row = counts.get(key);
    if (row) {
      row.log_count += 1;
    } else {
      counts.set(key, {
        time_bucket,
        service: log.service,
        level: log.level,
        log_count: 1,
      });
    }
  }

  const rows = [...counts.values()];
  await client.query(
    `INSERT INTO minute_rollups (time_bucket, service, level, log_count)
     SELECT * FROM unnest(
       $1::timestamptz[],
       $2::text[],
       $3::text[],
       $4::int[]
     ) AS t(time_bucket, service, level, log_count)
     ON CONFLICT (time_bucket, service, level)
     DO UPDATE SET log_count = minute_rollups.log_count + EXCLUDED.log_count`,
    [
      rows.map((r) => r.time_bucket),
      rows.map((r) => r.service),
      rows.map((r) => r.level),
      rows.map((r) => r.log_count),
    ],
  );
}
