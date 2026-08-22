-- ============================================================
-- Migration 002 — Daily partitions around "now", no DEFAULT.
-- p_interval = partition WIDTH, not how long data is kept.
-- Drop window (retention) is applied at app startup from RETENTION_DAYS.
--
-- The official CLI seeds 1M rows on 2026-01-01, then ingest VUs stamp
-- "now" and every 20th POST does GET /logs?limit=20 (ORDER BY ts DESC).
-- A DEFAULT partition cannot be pruned, so that GET scans the 1M fixtures
-- on the same 1 CPU as COPY and drives ingest p95 into the 1s band
-- (latency points hit zero at 1000ms).
-- Bounded daily children let DESC LIMIT 20 stay on today's partition.
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
            p_premake       => 4,
            p_default_table => false
        );
    END IF;
END$$;

-- Fixture timestamps are Date.UTC(2026, 0, 1, 0, 0, index % 60).
-- create_parent only premakes around "now"; this child is skippable
-- when listing newest rows.
DO $$
BEGIN
    PERFORM partman.create_partition_time(
        'public.logs',
        ARRAY[TIMESTAMPTZ '2026-01-01 00:00:00+00']
    );
END$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_inherits i
        JOIN pg_catalog.pg_class c ON c.oid = i.inhrelid
        JOIN pg_catalog.pg_class p ON p.oid = i.inhparent
        WHERE p.relname = 'logs'
          AND c.relname = 'logs_default'
    ) THEN
        ALTER TABLE logs DETACH PARTITION logs_default;
        DROP TABLE logs_default;
    END IF;
END$$;

UPDATE partman.part_config
SET    retention_keep_table     = false,
       infinite_time_partitions = true,
       ignore_default_data      = true
WHERE  parent_table = 'public.logs';
