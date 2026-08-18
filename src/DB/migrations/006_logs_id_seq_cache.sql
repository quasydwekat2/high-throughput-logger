-- BIGSERIAL default CACHE 1 makes COPY call nextval per row.
-- A large cache is safe here: ids only need to be unique, not gapless.
ALTER SEQUENCE IF EXISTS logs_id_seq CACHE 10000;
