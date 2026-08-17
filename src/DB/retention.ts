import { writePool } from './client.js';

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

  console.log(`retention policy: ${days} days (partman drop expired partitions)`);
}
