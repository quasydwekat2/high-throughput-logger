-- ============================================================
-- Migration 002 — Configure pg_partman for monthly partitions
-- pg_partman v5 API (Optimized for 1GB RAM Postgres Limit)
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM partman.part_config WHERE parent_table = 'public.logs'
    ) THEN
        -- 1. Partitioning by month to reduce partition metadata overhead
        PERFORM partman.create_parent(
            p_parent_table  => 'public.logs',
            p_control       => 'timestamp',
            p_interval      => '1 month',
            p_premake       => 1
        );
    END IF;
END$$;

-- 2. Automated Retention Cleanup (Drops partitions older than 30 days)
UPDATE partman.part_config
SET    retention                = '30 days',
       retention_keep_table     = false,     -- Instant DROP TABLE without VACUUM overhead
       infinite_time_partitions = true
WHERE  parent_table = 'public.logs';