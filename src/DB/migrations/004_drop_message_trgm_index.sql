-- ============================================================
-- Migration 004 — Drop write-heavy message trigram index
-- ILIKE q= still works via partition scans; visibility < 20s holds
-- without maintaining a GIN trgm index on every ingested row.
-- ============================================================

DROP INDEX IF EXISTS idx_logs_message_trgm;
