-- PK (timestamp, id) already supports ORDER BY timestamp DESC, id DESC
-- via a backward btree scan. Extra index only slows COPY.
DROP INDEX IF EXISTS idx_logs_ts_id;
