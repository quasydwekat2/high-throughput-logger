-- ============================================================
-- Migration 002 — Monthly partitions + partman automation
-- p_interval = partition WIDTH (30 days), not how long data is kept.
-- Drop window (retention) is applied at app startup from RETENTION_DAYS.
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM partman.part_config WHERE parent_table = 'public.logs'
    ) THEN
        PERFORM partman.create_parent(
            p_parent_table  => 'public.logs',
            p_control       => 'timestamp',
            p_interval      => '30 days',
            p_premake       => 1
        );
    END IF;
END$$;

UPDATE partman.part_config
SET    retention_keep_table     = false,
       infinite_time_partitions = true
WHERE  parent_table = 'public.logs';
