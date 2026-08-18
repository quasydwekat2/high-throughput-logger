-- ============================================================
-- Migration 003 — Single composite btree (write-cheap on 1 CPU)
-- PK (timestamp, id) already exists on logs.
-- No GIN on attributes: see 005.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_logs_service_level_ts
    ON logs (service, level, timestamp DESC, id DESC);
