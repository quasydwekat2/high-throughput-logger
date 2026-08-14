-- Drop write-heavy indexes from earlier revisions (no-op if absent).
DROP INDEX IF EXISTS idx_logs_level_ts;
DROP INDEX IF EXISTS idx_logs_attributes_path;
DROP INDEX IF EXISTS idx_logs_message_trgm;

-- Minute rollups: GET /logs/aggregate without q / attr.* reads this table.
CREATE TABLE IF NOT EXISTS minute_rollups (
    time_bucket TIMESTAMPTZ NOT NULL,
    service     TEXT        NOT NULL,
    level       TEXT        NOT NULL,
    log_count   INTEGER     NOT NULL,
    PRIMARY KEY (time_bucket, service, level)
);
