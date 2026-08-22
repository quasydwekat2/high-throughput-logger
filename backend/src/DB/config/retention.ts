import { writePool } from "../client.js";

/**
 * Sole writer of the drop window. Migration 002 only creates partitions
 * and sets keep_table/infinite; it does not set retention.
 */
export async function applyRetentionPolicy(days: number): Promise<void> {
  const result = await writePool.query(
    `UPDATE partman.part_config
     SET retention = $1
     WHERE parent_table = 'public.logs'`,
    [`${days} days`],
  );

  if (result.rowCount !== 1) {
    throw new Error(
      `failed to apply retention: expected 1 partman row, got ${result.rowCount ?? 0}`,
    );
  }

  await ensureLogPartitions(days);
  console.log(
    `retention policy: ${days} days (partman drop expired partitions)`,
  );
}

/**
 * Premake children covering the retention window plus a few future days.
 * Without a DEFAULT partition, COPY of any in-window timestamp must have
 * a child or it 500s (and the internal harness spreads ~30 days).
 */
async function ensureLogPartitions(days: number): Promise<void> {
  await writePool.query(
    `SELECT partman.create_partition_time(
       'public.logs',
       ARRAY(
         SELECT generate_series(
           date_trunc('day', now() - ($1::int * interval '1 day')),
           date_trunc('day', now() + interval '4 days'),
           interval '1 day'
         )
       )
     )`,
    [days],
  );
}
