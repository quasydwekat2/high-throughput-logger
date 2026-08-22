import type { PoolClient } from "pg";
import type { EncodedCopyPayload } from "../../types/log.types.js";

/**
 * Persist pre-aggregated per-minute (service, level) counts.
 * Must run on the same client/transaction as the COPY.
 */
export async function upsertMinuteRollupRows(
  client: PoolClient,
  encoded: EncodedCopyPayload,
): Promise<void> {
  if (encoded.rollupCounts.length === 0) return;
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
      encoded.rollupTimeBuckets,
      encoded.rollupServices,
      encoded.rollupLevels,
      encoded.rollupCounts,
    ],
  );
}
