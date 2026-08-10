# Final Project Checklist — Log Ingestion and Query Service

Obligatory requirements only. Status: `[x]` done · `[~]` partial · `[ ]` not done

---

## Critical blockers (fix before submit)

| # | Issue | Why it matters |
|---|--------|----------------|
| 1 | **No README** | Required deliverable |
| 2 | **No CI pipeline** | Required deliverable |
| 3 | **No automated tests / CI smoke** | Manual Docker E2E done; Vitest + CI still missing |
| 4 | **Load test results not measured/documented** | Performance grading needs evidence |
| 5 | **Demo video not recorded** | Required submission (~5 min) |

---

## 1. Core product concerns

- [x] **Ingestion** — API accepts individual or batched structured logs, validates, stores efficiently
- [x] **Querying** — filter by service, level, time, attributes, message; aggregate into time buckets / group dimensions
- [~] **Retention** — expired data deleted; Partman `30 days` works, but retention is not configurable via env (spec asks configurable)

### Log entry fields
- [x] `timestamp`
- [x] `level`: debug / info / warn / error
- [x] `service`
- [x] `message`
- [x] Flat key/value `attributes` (e.g. user_id, request_id, region)

---

## 2. Core requirements (musts)

- [x] Required API contract implemented exactly
- [x] Per-entry validation for ingestion batches
- [x] Freely combinable query filters
- [x] Time-bucketed aggregation
- [x] Cursor-based pagination
- [x] Starts with `docker compose up` (no `.env` required)
- [ ] README with all required sections (see §8)

---

## 3. Resource limits (compose)

- [x] App container: **0.5 CPU / 256 MB RAM**
- [x] PostgreSQL: **1 CPU / 1 GB RAM**
- [x] Postgres remains source of truth for reads and writes

---

## 4. Required API contract

### 4.1 Runtime
- [x] Listen on port **8080** inside app container
- [x] Exposed as `localhost:8080` in `docker-compose.yml`

### 4.2 `GET /health`
- [x] HTTP 200 when ready to accept traffic
- [x] Healthy only after: DB connected + migrations applied + ready for logs
- [x] Loadgen can poll until 200 (503 when not ready is OK)

### 4.3 `POST /logs` — Ingest
- [x] Always accepts a batch (`{ "logs": [...] }`; single entry OK)
- [x] Validation: timestamp ISO 8601, not > 5 min future
- [x] Validation: level ∈ debug/info/warn/error
- [x] Validation: non-empty service & message
- [x] Validation: attributes flat; string/number/boolean only (no nested objects/arrays)
- [x] Invalid entry does not fail whole batch
- [x] Accept valid / reject invalid with `{ index, reason }`
- [x] HTTP 200 when ≥1 accepted
- [x] HTTP 400 when all rejected, malformed JSON, or bad top-level shape
- [x] Response shape: `{ accepted, rejected: [{ index, reason }] }`

### 4.4 `GET /logs` — Query
- [x] Optional, freely combinable: `service`, `level`, `since`, `until`, `attr.<key>`, `q`, `limit`, `cursor`
- [~] `attr.<key>` compared **as strings** — current JSONB `@>` may miss numeric/boolean attrs (e.g. `retries: 3` vs `attr.retries=3`)
- [x] Sort: timestamp DESC (deterministic when timestamps tie — `id DESC`)
- [x] Cursor pagination; `next_cursor` or `null`
- [x] Default limit 100, max 1000
- [x] Invalid params → HTTP 400 `{ "error": "..." }`

### 4.5 `GET /logs/aggregate`
- [x] Required: `since`, `until`, `bucket` (`1m` / `5m` / `1h` / `1d`)
- [x] Optional: `group_by` (`service` / `level`)
- [x] Same filters as query: service, level, attr.*, q
- [x] Ordered by bucket start ascending
- [x] `group: null` when no `group_by`
- [x] Empty buckets may be omitted
- [x] Invalid params → HTTP 400 `{ "error": "..." }`

---

## 5. Load generator contract (obligatory posture)

Even with no optional features, the default must satisfy:

- [x] Plain `docker compose up` (no env file / args / manual setup) serves all four endpoints exactly as specified
- [x] Accepts **unauthenticated** requests on all four
- [x] No rate limit / quota / tenancy that loadgen could hit by default
- [x] Never respond 200 to a batch not durably accepted

> Auth / rate limiting / multi-tenancy are **optional**. If not implemented, ignore those sections. If implemented later, they must stay off by default and follow the auth contract.

---

## 6. Performance targets (must prove)

| Target | Status |
|--------|--------|
| ≥ 15,000 logs/sec sustained | `[ ]` not measured |
| No drops / crashes under load | `[ ]` not measured |
| Primary aggregation p95 &lt; 1s | `[ ]` not measured |
| Query OK while ingesting | `[ ]` not measured |
| ~1,000,000 rows (~1 month of data) | `[ ]` not measured |
| New data queryable &lt; 20s | `[x]` smoke OK; not load-tested |
| 1 aggregation req/sec during ingest | `[ ]` not measured |
| Own load tests before submit | `[ ]` not done |
| Submit / tune via https://loadgen.foothilltech.net/ | `[ ]` not done |

A correct solution that misses these is **not complete**.

### Implementation already helping performance
- [x] Bulk insert (COPY default; unnest / row-by-row available)
- [x] Partitioning + indexes aligned to query patterns
- [x] Connection pool tuning
- [x] Ingest buffer (flush by size/timer)

---

## 7. What graders evaluate (obligatory quality bar)

| Area | Status | Notes |
|------|--------|--------|
| Architecture | `[~]` | Schema, attributes JSONB, data flow, structure in place; document in README |
| Performance | `[ ]` | Need measured evidence under load |
| Retention | `[~]` | Partman drop partitions (good); configurability incomplete |
| Reliability | `[x]` | Validation, errors, edge cases largely covered |
| Code quality | `[x]` | Typed TS, clear layers |
| Security | `[x]` | Parameterized queries |
| Separation of concerns | `[x]` | Handlers ≠ repositories / query builders |
| Infrastructure | `[x]` | Compose works first run; migrations auto |
| CI | `[ ]` | Build / test / validate missing |
| Documentation | `[ ]` | README missing |

---

## 8. README (required sections)

- [ ] Setup and usage
- [ ] API documentation
- [ ] Schema and index design
- [ ] Attribute storage strategy
- [ ] Retention strategy
- [ ] Load-test methodology
- [ ] Measured performance results (env, dataset size, batch size, ingest rate, query rate, latency percentiles, resource usage, bottlenecks, optimizations)
- [ ] Known limitations
- [ ] Optional features list (defaults + env vars) — or state **none**

---

## 9. Deliverables

- [~] GitHub repository with clean, incremental commit history
- [x] Working Docker Compose (`docker compose up`)
- [ ] Passing CI pipeline (build, test, validate)
- [ ] Complete README
- [ ] Load testing via portal + tune as needed
- [ ] ~5 min video: architecture + live demo
- [ ] Demo readiness: explain schema, indexes, EXPLAIN, ingest/query paths

### CI smoke (obligatory)
- [ ] `AUTH_ENABLED=false` — all four endpoints with no credentials  
- [ ] `AUTH_ENABLED=true` + `LOADGEN_API_KEY` — **only if auth is implemented**

---

## Suggested next work order

1. Fix `attr.<key>` string-equality if loadgen uses numeric/boolean attrs.
2. Make retention configurable (or document Partman value + how to change it if accepted as design).
3. Write README (all §8 sections).
4. Add Vitest smoke/contract tests + GitHub Actions CI.
5. Run load tests; tune; document numbers in README.
6. Submit to https://loadgen.foothilltech.net/ and iterate.
7. Record ~5 min demo video.
8. Submit final project.

---

## Quick scoreboard

| Area | Rough status |
|------|----------------|
| Core API | ~97% (attr string match still open) |
| Retention | Done via Partman; configurability partial |
| Docker / infra | **Done** |
| Performance proof | ~5% (smoke only) |
| Tests / CI / README | ~5% |
| Submission readiness | **Not ready** until README, CI, tests, load numbers, and video are done |
`)