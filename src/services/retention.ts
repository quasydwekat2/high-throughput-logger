import { pool } from '../DB/client.js';
import { config } from '../config.js';

/**
 * Syncs RETENTION_DAYS into pg_partman so the BGW drops old partitions.
 * Migration 002 sets a default; this lets env override without re-migrating.
 */
export async function applyRetentionConfig(): Promise<void> {
  const days = config.retentionDays;
  if (!Number.isFinite(days) || days < 1) {
    throw new Error(`RETENTION_DAYS must be a positive integer, got: ${days}`);
  }

  const result = await pool.query(
    `UPDATE partman.part_config
     SET retention = $1::text,
         retention_keep_table = false
     WHERE parent_table = 'public.logs'`,
    [`${days} days`],
  );

  if (result.rowCount === 0) {
    console.warn(
      'partman config for public.logs not found — retention not applied',
    );
    return;
  }

  console.log(`retention set to ${days} days (pg_partman)`);
}
