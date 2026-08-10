# Project Checklist — Log Ingestion and Query Service

Status legend: `[x]` done · `[~]` partial / needs work · `[ ]` not done

---

## Critical blockers (fix before submit)

| # | Issue | Why it matters |
|---|--------|----------------|
| 1 | ~~`src/server.ts` is missing~~ **DONE** | `app.ts` builds Express; `server.ts` boots, checks DB, listens, graceful shutdown |
| 2 | **No README** | Required deliverable |
| 3 | **No CI pipeline** | Required deliverable |
| 4 | **No automated tests / CI smoke** | Manual Docker E2E smoke done; Vitest + CI contract checks still missing |
| 5 | **Load test results not measured/documented** | Performance grading needs evidence |
| 6 | ~~`docker compose up` may need `.env`~~ **DONE** | Postgres/pgAdmin/app vars have compose defaults (`:-…`); bare `docker compose up` works without `.env` |

---

## Part 1 — Required API Contract

### 1.1 Endpoints & wiring
- [x] `GET /health`
- [x] `POST /logs`
- [x] `GET /logs`
- [x] `GET /logs/aggregate`
- [x] App listens on port **8080** (compose maps `8080:8080`)
- [x] **Server entrypoint** — `src/app.ts` (`buildApp`) + `src/server.ts` (listen, SIGINT/SIGTERM → `pool.end()`). DB liveness is owned by `/health` only.

### 1.2 `GET /health`
- [x] Returns HTTP 200 when DB responds and migrations are applied
- [x] Checks DB via `pgmigrations` count (connectivity + schema readiness; not duplicated in `server.ts`)
- [x] Healthy only after migrations applied — queries `pgmigrations` (expects 3 rows; bump `EXPECTED_MIGRATION_COUNT` when adding a migration). Compose `depends_on: migrate` still boots order.
- [x] Returns 503 when DB down or migrations incomplete (allowed; loadgen polls until 200)

### 1.3 `POST /logs` — Ingestion
- [x] Accepts batch `{ "logs": [...] }` (single entry OK)
- [x] Per-entry validation (does not fail whole batch)
- [x] Accepts valid / rejects invalid with `{ index, reason }`
- [x] HTTP 200 when at least one accepted
- [x] HTTP 400 when all rejected or bad top-level shape
- [x] Central error middleware for all routes/handlers (`middleware/error.middleware.ts` + `types/app-error.ts`):
  - Malformed JSON → 400
  - ValidationError → 400
  - IngestRejectedError → 400 `{ accepted, rejected }`
  - AuthenticationError → 401
  - NotFoundError / unknown route → 404
  - DatabaseError / pg errors → 500
  - ServiceUnavailableError (`/health`) → 503 `{ status: unavailable }`
  - Unexpected → 500
- [x] Validation: timestamp ISO 8601, not > 5 min future
- [x] Validation: level ∈ debug/info/warn/error
- [x] Validation: non-empty service & message
- [x] Validation: attributes flat object; string/number/boolean only (`AttributeValue`)
- [x] Bulk insert strategies (switch one line in `ingest/select-strategy.ts`):
  - [x] **`copy`** (default) — `COPY FROM STDIN` via `pg-copy-streams`
  - [x] **`unnest`** — `INSERT … SELECT * FROM unnest(...)`
  - [x] **`row-by-row`** — one `INSERT` per row (benchmark baseline)

### 1.4 `GET /logs` — Query
- [x] Filters: `service`, `level`, `since`, `until`, `attr.<key>`, `q`, `limit`, `cursor`
- [x] Freely combinable filters
- [x] Sort: `timestamp DESC, id DESC` (deterministic)
- [x] Cursor-based pagination (`next_cursor` or `null`)
- [x] Default limit 100, max 1000
- [x] Invalid params → HTTP 400 `{ "error": "..." }`
- [x] Request typed as `QueryLogsParams` → parsed `ParsedQueryParams`
- [~] Spec: `attr.<key>` compared **as strings** — current `@>` JSONB match may miss numeric/boolean attrs stored as non-strings (e.g. `retries: 3` vs `attr.retries=3`)

### 1.5 `GET /logs/aggregate`
- [x] Required: `since`, `until`, `bucket` (`1m` / `5m` / `1h` / `1d`)
- [x] Optional: `group_by` (`service` / `level`)
- [x] Same filters as query: service, level, attr.*, q
- [x] Ordered by bucket start ascending
- [x] `group: null` when no `group_by`
- [x] Empty buckets omitted
- [x] Invalid params → HTTP 400 `{ "error": "..." }`
- [x] Request typed as `AggregateLogsParams` → parsed `ParsedAggregateParams`

---

## Part 2 — Storage, Schema, Retention

### 2.1 Schema & attributes
- [x] Table `logs` with timestamp, level, service, message, attributes
- [x] Attributes as **JSONB** (flat key/value)
- [x] Partitioned by range on `timestamp` (monthly via pg_partman)
- [x] Indexes: service+level+ts+id, level+ts+id, GIN attributes, GIN trigram on message
- [x] Parameterized queries (no string-concat user values into SQL for filters)

### 2.2 Retention
- [x] Retention via **pg_partman** (drop old partitions, `retention = '30 days'`)
- [~] Spec asks for **configurable** retention — currently hardcoded in migration; app env `RETENTION_DAYS` / `RETENTION_CRON` unused (and app-level cron not needed if Partman owns it)
- [x] Avoids row-by-row deletes (partition drop) — good for load/locks

---

## Part 3 — Infrastructure (Docker / Compose)

- [x] `Dockerfile` (multi-stage production build)
- [x] `Dockerfile.db` (Postgres 16 + pg_partman)
- [x] `docker-compose.yml` with postgres, migrate, app
- [x] Migrations run automatically before app starts
- [x] Resource limits: app 0.5 CPU / 256MB; postgres 1 CPU / 1GB
- [x] `docker compose up` **with no env file** — Postgres/pgAdmin/app vars use compose defaults (`POSTGRES_*`, `PGADMIN_*`, `PORT`, etc.)
- [x] Extra infra OK (pgAdmin present) — Postgres remains source of truth
- [x] Verified end-to-end: `docker compose up` → health 200 → ingest/query/aggregate (smoke: `POST /logs` accepted 1, `GET /logs` returned row, `GET /logs/aggregate` bucket count 1)

---

## Part 4 — Performance Targets

| Target | Status |
|--------|--------|
| ≥ 15,000 logs/sec sustained | `[ ]` not measured / not proven |
| No drops / crashes under load | `[ ]` not measured |
| Aggregation p95 &lt; 1s | `[ ]` not measured |
| Query OK while ingesting | `[ ]` not measured |
| ~1,000,000 rows (~1 month) | `[ ]` not measured |
| New data queryable &lt; 20s | `[x]` smoke-verified (ingest → query immediate); not load-tested |
| 1 agg req/sec during ingest | `[ ]` not measured |
| Loadgen portal submissions / tuning | `[ ]` not done |

### Performance-oriented implementation already in place
- [x] Bulk insert strategies: **COPY** (default), `unnest`, row-by-row
- [x] Partitioning + indexes aligned to query patterns
- [x] Connection pool tuning env vars
- [ ] Optional: in-app buffer / batching queue (commented ideas in `config.ts` only)

---

## Part 5 — Code Quality, Tests, CI, Docs

### 5.1 Structure & quality
- [x] TypeScript, typed contracts in `log.types.ts` (request + parsed + response)
- [x] Separation: `app` / `server` → routes → handlers → repositories / utils
- [x] Ingest strategy pattern under `repositories/logs/ingest/`
- [x] Clear validation utils + query param parsing
- [~] Dead / unused deps possible (`node-cron` unused; `pg-copy-streams` **used** by COPY strategy)

### 5.2 Tests
- [ ] Unit / integration tests (Vitest configured, **no test files**)
- [~] Contract smoke tests for the 4 endpoints — **manual Docker E2E done**; automated Vitest/CI smoke still missing

### 5.3 CI
- [ ] GitHub Actions (or similar): build, test, validate
- [ ] Smoke with `AUTH_ENABLED=false` (required)
- [ ] Smoke with `AUTH_ENABLED=true` + `LOADGEN_API_KEY` — **only if auth is implemented**

### 5.4 README (required sections)
- [ ] Setup and usage
- [ ] API documentation
- [ ] Schema and index design
- [ ] Attribute storage strategy
- [ ] Retention strategy
- [ ] Load-test methodology + measured results
- [ ] Known limitations
- [ ] Optional features list (defaults + env vars) — or state “none”

---

## Part 6 — Optional Features & Stretch Goals

Golden rule: extras additive, off by default, `docker compose up` = plain core service.

| Feature | Status | Notes |
|---------|--------|--------|
| Auth / API keys | `[ ]` not implemented (commented in config) | OK to skip; default must stay open |
| Rate limiting | `[ ]` | Must stay off by default |
| Multi-tenancy | `[ ]` | |
| Dashboard | `[ ]` | |
| Metrics / alerting | `[ ]` | |
| Live-tail | `[ ]` | |
| Rollup tables | `[ ]` | |
| Backpressure / DLQ | `[ ]` | |
| pgAdmin in compose | `[~]` present | Dev aid; document if kept |
| Ingest strategy switch | `[x]` | One-line switch; COPY default |

---

## Part 7 — Deliverables & Demo Prep

- [~] GitHub repo with history (local repo exists; push/history quality TBD)
- [x] Working Docker Compose (zero-config defaults + E2E smoke verified)
- [ ] Passing CI pipeline
- [ ] Complete README
- [ ] Load testing via https://loadgen.foothilltech.net/ (iterate / tune)
- [ ] ~5 min video: architecture + live demo
- [ ] Demo readiness: explain schema, indexes, EXPLAIN, ingest/query paths

---

## Suggested next work order

1. ~~Add `src/server.ts` (build app, listen, graceful pool handling).~~ **Done** (`app.ts` + `server.ts`).
2. ~~Add JSON body-parse error middleware → 400.~~ **Done** (`middleware/error.middleware.ts`).
3. Decide attr string-equality strategy (cast/compare as text) if loadgen uses numeric attrs.
4. ~~Make compose env defaults so bare `docker compose up` works.~~ **Done**.
5. ~~Smoke-test all 4 endpoints locally / in Docker.~~ **Done**.
6. Write README (design + retention + indexes + ingest strategies).
7. Add Vitest smoke/contract tests + GitHub Actions CI.
8. Run load tests (compare COPY vs unnest), tune, document numbers in README.
9. Submit to loadgen portal; iterate.
10. Record demo video.

---

## Quick scoreboard

| Area | Rough status |
|------|----------------|
| Core API implementation | ~97% (entrypoint + JSON 400 middleware done; attr string match still open) |
| Retention | Done (Partman); configurability partial |
| Docker / infra | **Done** (zero-config defaults + E2E smoke verified) |
| Performance proof | ~5% (queryable-after-ingest smoke OK; load targets not measured) |
| Tests / CI / README | ~5% (manual E2E only; no Vitest/CI/README yet) |
| Optional features | Ingest strategy switch only (fine) |
| Submission readiness | **Not ready** until README, CI, automated tests, and load numbers are cleared |
