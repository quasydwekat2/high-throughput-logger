-- ============================================================
-- Migration 003 — Performance Indexes (Optimized for 15k+ logs/sec)
-- High write throughput & Cursor-based pagination support
-- ============================================================

-- 1. Extension required for text substring search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Primary query pattern: (service + level + timestamp + id) for cursor pagination
CREATE INDEX IF NOT EXISTS idx_logs_service_level_ts
    ON logs (service, level, timestamp DESC, id DESC);

-- 3. Secondary query pattern: Filtering ONLY by level + timestamp
CREATE INDEX IF NOT EXISTS idx_logs_level_ts
    ON logs (level, timestamp DESC, id DESC);

-- 4. Fast & Lightweight JSONB filtering (attributes @> '{"key": "val"}')
CREATE INDEX IF NOT EXISTS idx_logs_attributes_path
    ON logs USING GIN (attributes jsonb_path_ops);

-- 5. Fast Substring Search for queries like q=declined (%ILIKE%)
CREATE INDEX IF NOT EXISTS idx_logs_message_trgm
    ON logs USING GIN (message gin_trgm_ops);