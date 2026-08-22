-- Minute rollups are rebuilt from logs if lost; UNLOGGED skips WAL on the
-- upsert that sits in the same transaction as COPY.
-- fillfactor leaves room for HOT updates of log_count (indexed keys unchanged).
ALTER TABLE minute_rollups SET UNLOGGED;
ALTER TABLE minute_rollups SET (fillfactor = 70);
