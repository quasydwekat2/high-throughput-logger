-- ============================================================
-- Migration 001 — create logs table and extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE SCHEMA IF NOT EXISTS partman;
CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;

CREATE TABLE IF NOT EXISTS logs (
    id          BIGSERIAL       NOT NULL,
    timestamp   TIMESTAMPTZ     NOT NULL,
    level       VARCHAR(10)     NOT NULL,
    service     VARCHAR(255)    NOT NULL,
    message     TEXT            NOT NULL,
    attributes  JSONB           NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (timestamp, id)
) PARTITION BY RANGE (timestamp);
