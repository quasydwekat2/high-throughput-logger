-- ============================================================
-- Migration 005 — Sequence cache for parallel COPY ingest
-- Parallel flushes contend on nextval(logs_id_seq); a larger
-- CACHE reduces catalog round-trips under the 1 CPU Postgres limit.
-- ============================================================

ALTER SEQUENCE logs_id_seq CACHE 1000;
