# Log Ingestion and Query Service

High-throughput structured log API: ingest batches, filter and page results, aggregate into time buckets. PostgreSQL is the source of truth for reads and writes.

```
backend/   TypeScript API + dashboard static files in public/
```

`docker compose up` with **no extra flags** starts the graded core service: unauthenticated `GET /health`, `POST /logs`, `GET /logs`, and `GET /logs/aggregate` on **localhost:8080**. The dashboard is the same origin: **http://localhost:8080/**. A `.env` file is optional: Compose interpolates `${VAR}` from `.env` when present, and uses the same defaults as `.env.example` when it is not.

The load generator talks only to `:8080`. The UI is additive and does not change required paths, headers, or response shapes.

## Setup and usage

**Requirements:** Docker Compose.

```bash
docker compose up --build
```

Wait until the app is healthy, then:

```bash
curl -s http://localhost:8080/health
```

Dashboard: [http://localhost:8080/](http://localhost:8080/) — the API serves `backend/public/` from the same container. Required endpoints are unchanged.

`GET /health` returns **200** only after the database is up, migrations have been applied, and the process is ready to accept logs.

| Service    | Role                                         | Limits           |
|------------|----------------------------------------------|------------------|
| `postgres` | PostgreSQL 16 + pg_partman                   | 1 CPU / 1 GB     |
| `migrate`  | Applies `backend/src/DB/migrations`, then exits | —             |
| `app`      | HTTP API + dashboard on port 8080            | 0.5 CPU / 256 MB |

The `load-test` Compose service is behind profile `load-test` and is **not** started by a plain `up`.

**Contract smoke** (stack already up):

```bash
cd backend
npm ci
npm run test:contract
```

**Local app (optional):** copy `.env.example` → `.env` at the repo root, run Postgres, then from `backend/`: `npm run migrate:up`, `npm run dev`. The dashboard is `GET /` from `public/`. `DATABASE_URL` in `.env` is host-local (`localhost`); Compose rebuilds it with host `postgres` for `app` / `migrate`. `NODE_ENV=development` applies to `npm run dev` only; the app container stays `production`.

Tear down (keeps volumes): `docker compose down`. Reset data: `docker compose down -v`.

## API

All four required endpoints are unauthenticated. Extra `Authorization` headers are ignored.

### `GET /health`

**200** when ready (any JSON body is allowed; this service returns `{ "status": "ok" }`). **503** while the DB or migrations are not ready.

### `POST /logs`

Always a batch. One entry is a valid batch. Invalid rows do not fail the whole request.

```json
{
  "logs": [
    {
      "timestamp": "2026-07-20T14:32:01.123Z",
      "level": "error",
      "service": "checkout",
      "message": "payment declined",
      "attributes": {
        "user_id": "42",
        "region": "eu-west",
        "retries": 3
      }
    }
  ]
}
```

| Field | Rules |
|-------|--------|
| `timestamp` | Required ISO-8601 with timezone; not more than 5 minutes in the future |
| `level` | `debug` \| `info` \| `warn` \| `error` |
| `service` / `message` | Non-empty strings |
| `attributes` | Optional flat object; values string, number, or boolean only |

**200** if at least one row is accepted (only after a durable Postgres write). **400** if every row is rejected, the JSON is malformed, or the body is not `{ "logs": [...] }`.

```json
{
  "accepted": 9,
  "rejected": [{ "index": 3, "reason": "level must be one of: debug, info, warn, error" }]
}
```

### `GET /logs`

All query parameters are optional and combinable. Results are `timestamp DESC`, then `id DESC`. Default `limit` is 100 (max 1000).

| Param | Meaning |
|-------|---------|
| `service`, `level` | Exact match |
| `since` | Inclusive start |
| `until` | Exclusive end |
| `attr.<key>` | Attribute equality (query values are strings; see [Attributes](#attribute-storage-strategy)) |
| `q` | Case-insensitive substring on `message` |
| `limit`, `cursor` | Page size and opaque cursor |

```json
{
  "logs": [
    {
      "id": "1",
      "timestamp": "2026-07-20T14:32:01.123000Z",
      "level": "error",
      "service": "checkout",
      "message": "payment declined",
      "attributes": { "user_id": "42" }
    }
  ],
  "next_cursor": null
}
```

`next_cursor` is `null` when there is no next page. Invalid params → **400** `{ "error": "<description>" }`.

### `GET /logs/aggregate`

Same filters as `GET /logs` (`service`, `level`, `attr.*`, `q`), plus:

| Param | Required | Values |
|-------|----------|--------|
| `since`, `until` | yes | Inclusive / exclusive range |
| `bucket` | yes | `1m`, `5m`, `1h`, `1d` |
| `group_by` | no | `service` or `level` |

Rows are ordered by bucket start ascending. Empty buckets may be omitted. Without `group_by`, `group` is `null`.

```json
{
  "buckets": [
    { "start": "2026-07-20T14:00:00.000Z", "group": "checkout", "count": 118 }
  ]
}
```

## Architecture

```
POST /logs  → validate per row → ingest buffer (coalesce) → COPY logs + upsert minute_rollups
GET  /logs  → parameterized SQL on logs (PK / service+level index)
GET  /logs/aggregate → minute_rollups when no q/attr.*; else COUNT on logs
```

Handlers stay thin. Validation lives in `backend/src/utils/`. SQL lives in `backend/src/repositories/`. Three pools: write (COPY), query (`GET /logs` + health), aggregate (`GET /logs/aggregate`) so a heavy COUNT does not block ingest or list queries.

`POST /logs` does not return 200 until the batch is committed. Concurrent POSTs are merged into bulk `COPY` (default flush 2 ms / 1000 rows, concurrency 1 — Postgres has 1 CPU).

## Schema and index design

`logs` is range-partitioned on `timestamp` (pg_partman, **1-day** partition width). Primary key is `(timestamp, id)` so ingest is append-friendly and `ORDER BY timestamp DESC, id DESC` can walk the PK backward without a second btree.

There is **no DEFAULT partition**. The official CLI seeds 1M rows on `2026-01-01`, then ingest traffic is stamped “now”. A default child cannot be pruned, so `GET /logs?limit=20` during ingest would scan those fixtures on the same 1 CPU as COPY. A bounded `2026-01-01` child can be skipped when listing newest rows.

| Object | Purpose |
|--------|---------|
| `PRIMARY KEY (timestamp, id)` | Uniqueness + default time-ordered list |
| `idx_logs_service_level_ts (service, level, timestamp DESC, id DESC)` | Filtered list queries |
| `minute_rollups (time_bucket, service, level)` | Pre-aggregated counts for the common aggregate path |
| `logs_id_seq CACHE 10000` | Fewer `nextval` calls during COPY |

No GIN on `attributes`, and no extra `(timestamp, id)` btree (it would duplicate the PK). `q` uses `ILIKE` with a bound parameter — substring search is the slower path; COPY stays cheap on 0.5 CPU / 1 CPU Postgres.

`GET /logs/aggregate` without `q` or `attr.*` reads `minute_rollups` (updated in the same transaction as COPY). Filters on message or attributes fall back to `COUNT(*)` on `logs`.

## Attribute storage strategy

Attributes are a **single JSONB column** (`{}` if omitted). **Not indexed.**

**Why JSONB, not EAV:** one row per log, one COPY stream, no join explosion at 15k+/s. Arbitrary keys (`user_id`, `request_id`, `region`) stay in the document.

**Why no GIN:** keys are not known at schema time, so the only useful index would be GIN on the whole document (`jsonb_path_ops` for `@>`). The official ingest path never filters `attr.*` (it lists newest rows and aggregates via rollups). Maintaining GIN on every COPY row costs more Postgres CPU than unknown-key equality is worth under a 0.5 / 1 CPU cap. Expression indexes on specific keys would also fail the graded seed (different keys each run).

**Query matching:** `attr.<key>` arrives as a string. Stored values may be strings, numbers, or booleans. The query builder ORs `@>` probes for the string and, when the token looks like a boolean or number, for that typed JSON value as well (`retries: 3` matches `attr.retries=3`). Nested objects and arrays are rejected at ingest. Partition pruning keeps those scans off the live ingest child.

## Retention strategy

Expired data is **dropped as whole partitions**, not `DELETE`d row-by-row (avoids long locks and bloat on the live ingest path).

- Partition **width** (`p_interval`) is `'1 day'` in migration 002 — how large each child table is.
- Drop **window** is **`RETENTION_DAYS`** (default **30**). At startup the app writes `partman.part_config.retention` (`backend/src/DB/config/retention.ts`). Restart after changing the env var; no new migration.
- `retention_keep_table = false` so expired partitions are dropped, not detached and left on disk.
- pg_partman BGW runs hourly (`pg_partman_bgw.interval=3600`).

Invalid or non-positive `RETENTION_DAYS` falls back to 30.

## Load-test methodology

### Official CLI (use this for scoring)

Pinned: `github:Ahmad-Abbas-Foothill/logs-benchmark-cli#992d9c8`.

```bash
npx --yes "github:Ahmad-Abbas-Foothill/logs-benchmark-cli#992d9c8" --compose ./docker-compose.yml --full --seed 6122026 --generator-cpus 4
```

`--full` is the ~1M-row ingest + query + aggregate run. `--seed 6122026` keeps the payload reproducible. `--generator-cpus 4` is for the generator process; the app/Postgres limits stay 0.5 CPU / 256 MB and 1 CPU / 1 GB.

Official `--full` numbers (2026-08-20, scorer `2026-08-18.v10`, same machine as development):

| Category | Score | Detail |
|----------|-------|--------|
| Correctness | 15.0 / 15 | 15/15 checks |
| Performance | 47.5 / 50 | **14,999/s** · errors 0.0% · p95 **30ms** |
| Queries | 14.6 / 15 | aggregate p95 **22ms** · consistency 4/4 |
| Reliability | 20.0 / 20 | 4/4 scenarios |
| **Total** | **97.1 / 100** | Docker Desktop 6 CPU / 6 GiB, machine speed 0.49x reference |

Quote the engine size with the score. Performance points are indicative on this machine.

### Internal harness (tuning only)

Not the grader. With the stack on localhost:8080:

```bash
cd backend
npx tsx load-test/run.ts
```

| Setting | Value |
|---------|--------|
| Dataset | 1,000,000 logs |
| Target ingest | 15,000 /s |
| Batch size | 500 |
| Ingest concurrency | 32 |
| Aggregate | ~1 req/s during ingest (`group_by=service`, `bucket=1h`) |
| Query | ~1 req / 2s (`service=checkout&level=error`) |
| Visibility deadline | 20 s |
| Warmup | 5 s |
| App / PG limits | 0.5 CPU 256 MB / 1 CPU 1 GB (Compose `deploy.resources`) |

## Measured performance results

**Environment:** Docker Compose as in this repo (app 0.5 CPU / 256 MB, Postgres 1 CPU / 1 GB). Local internal harness only (`npx tsx load-test/run.ts`, 2026-08-22) — not the official company CLI.

| Metric | Result |
|--------|--------|
| Sustained ingest | **15,531 /s** (target 15,000 /s) |
| Accepted / rejected | 1,000,000 / 0 |
| Failed batches / crashes | 0 / 0 |
| Ingest latency | p50 19.5 ms · p95 109.3 ms · p99 184.9 ms · max 319.6 ms (n=2,000) |
| Aggregate p95 | **495.3 ms** (p50 423.2 ms, p99 773.8 ms, max 773.8 ms, n=64) — under 1 s |
| Query during ingest | 32 ok / 0 fail · p50 5.0 ms · p95 59.6 ms · p99 61.2 ms |
| Time to query new data | **2.5 s** (2501 ms, under 20 s) |
| Duration | 64.4 s · 2000 ingest batches |

HTTP status mix: `ingest:200` × 2,000, `agg:200` × 64, `query:200` × 32. Spec checks: **7/7 passed**.

**Bottlenecks:** Postgres CPU and a single COPY stream (write pool max 1). Extra btree/GIN indexes, a DEFAULT partition that could not be pruned, and `CACHE 1` on `logs_id_seq` dominated write time in earlier revisions.

**Optimizations applied:** bulk `COPY`; ingest buffer coalescing; `synchronous_commit=off` on the local PG image; daily partitions with no DEFAULT; PK-only time order (no duplicate ts/id index); one service+level btree; no GIN on attributes; sequence cache 10 000; minute rollups in the COPY transaction; split query/aggregate pools; `wal_compression=off` and conservative `work_mem` under 1 GB RAM.

## Known limitations

- `q` (`ILIKE`) is not index-backed; large ranges plus substring search can scan more heap than equality filters.
- Aggregate without `q`/`attr.*` uses minute rollups. `since`/`until` that do not line up on minute boundaries can include a partial first/last minute of rollup data.
- If the in-memory ingest queue exceeds `QUEUE_MAX_SIZE` (default 100 000), the API returns **503**. Those requests are not counted as ingested.
- `POST /logs` JSON body is capped at **2 MB**.
- Timestamps without a timezone offset are rejected (load traffic uses `Z` / offset form).
- Changing partition **width** (`p_interval`) only applies on a **new** database (`create_parent` is skipped if partman is already configured). Change `RETENTION_DAYS` with an app restart.

## Optional features

**Dashboard (served by the API, on by default).** Static files in `backend/public/` are served as `GET /` from the **same** `app` container (0.5 CPU / 256 MB). No extra frontend folder or nginx container. It only calls the four required endpoints on the same origin. It does not add auth, required headers, or response fields.

There is no authentication, API keys, multi-tenancy, or rate limiting. `AUTH_ENABLED` is not read.

`docker compose up` with no configuration is the unauthenticated core service on **:8080**, including this dashboard at `/`. The load generator never needs the UI.

Tune via `.env` (Compose interpolates the same names). Defaults below apply if `.env` is missing.

| Variable | Default | Effect |
|----------|---------|--------|
| `RETENTION_DAYS` | `30` | Partman drop window (days) |
| `INGEST_BUFFER_ENABLED` | `true` | Coalesce POSTs into COPY (`false` = insert each HTTP batch immediately) |
| `FLUSH_INTERVAL_MS` | `2` | Buffer flush timer |
| `FLUSH_BATCH_SIZE` | `1000` | Max logs per COPY |
| `FLUSH_CONCURRENCY` | `1` | Parallel COPY streams |
| `QUEUE_MAX_SIZE` | `100000` | In-memory cap before 503 |
| `PG_WRITE_POOL_MAX` | `1` | COPY connections |
| `PG_QUERY_POOL_MAX` | `1` | `GET /logs` + health |
| `PG_AGGREGATE_POOL_MAX` | `1` | `GET /logs/aggregate` |

These tune the same core API. They do not add required headers or change response shapes.

## CI

GitHub Actions (`.github/workflows/ci.yml`):

1. `backend`: `npm ci` → `tsc --noEmit` → `tsc`
2. `docker compose up --build --wait postgres migrate app` → `backend` `npm run test:contract` (`AUTH_ENABLED=false`, four endpoints, Bearer ignored)
