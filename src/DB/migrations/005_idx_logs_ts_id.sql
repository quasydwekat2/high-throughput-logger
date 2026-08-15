-- Unfiltered GET /logs: ORDER BY timestamp DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_logs_ts_id ON logs (timestamp DESC, id DESC);
