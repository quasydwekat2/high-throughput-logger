-- ============================================================
-- Migration 002 — Daily partitions + 30-day drop retention
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM partman.part_config WHERE parent_table = 'public.logs'
    ) THEN
        PERFORM partman.create_parent(
            p_parent_table  => 'public.logs',
            p_control       => 'timestamp',
            p_interval      => '1 day',
            p_premake       => 2
        );
    END IF;
END$$;

UPDATE partman.part_config
SET    retention                = '30 days',
       retention_keep_table     = false,
       infinite_time_partitions = true
WHERE  parent_table = 'public.logs';
