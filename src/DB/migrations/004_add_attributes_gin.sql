-- Minute rollups: GET /logs/aggregate without q / attr.* reads this table.
CREATE TABLE IF NOT EXISTS minute_rollups (
    time_bucket TIMESTAMPTZ NOT NULL,
    service     TEXT        NOT NULL,
    level       TEXT        NOT NULL,
    log_count   INTEGER     NOT NULL,
    PRIMARY KEY (time_bucket, service, level)
);
