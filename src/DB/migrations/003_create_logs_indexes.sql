-- ============================================================
-- Migration 003 — Single composite btree (write-cheap on 1 CPU)
-- PK (timestamp, id) already exists on logs.
-- GIN jsonb_path_ops for attr @> is in 006 (cheaper than jsonb_ops / trgm).
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_logs_service_level_ts
    ON logs (service, level, timestamp DESC, id DESC);
