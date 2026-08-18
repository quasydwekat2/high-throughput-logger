-- Containment-only GIN (@>) for attr.* filters. jsonb_path_ops is smaller
-- and cheaper to maintain during COPY than default jsonb_ops.
-- fastupdate=on: new keys land in a pending list, merged later (autovacuum).
CREATE INDEX IF NOT EXISTS idx_logs_attrs_path_ops
    ON logs USING GIN (attributes jsonb_path_ops)
    WITH (fastupdate = on);
