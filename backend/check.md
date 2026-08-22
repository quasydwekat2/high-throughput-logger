# Final Project Checklist — Log Ingestion and Query Service

Obligatory requirements only. Status: `[x]` done · `[~]` partial · `[ ]` not done

Updated: 2026-08-18 (official CLI `--full` **88.7 / 100**; daily partitions, no JSONB GIN)

---

## Critical blockers (fix before submit)

| # | Issue | Why it matters |
|---|--------|----------------|
| 1 | ~~No README~~ | **Resolved** — `README.md` |
| 2 | **CI not green on GitHub yet** | Workflow exists (`.github/workflows/ci.yml`); first push must pass |
| 3 | ~~Internal `load-test/run.ts`~~ | **Resolved** — own harness PASS (see §6b). Not the grader. |
| 4 | ~~Official CLI not run~~ | **Resolved** — `--full` **88.7 / 100** (see §6a). Paste into README if still pending. |
| 5 | **Demo video not recorded** | Required submission (~5 min) |

---

## 1. Core product concerns

- [x] **Ingestion** — batch API, per-entry validation, durable store (COPY + buffer waits for flush)
- [x] **Querying** — filters, cursor pagination, time-bucket aggregate + `group_by`
- [x] **Retention** — pg_partman drops expired partitions; window from `RETENTION_DAYS` at app startup (`src/DB/config/retention.ts`). Partition width `p_interval` is `'1 day'` in migration 002 (schema, not the delete policy). No DEFAULT partition; bounded `2026-01-01` child for CLI fixtures.

### Log entry fields

- [x] `timestamp`
- [x] `level`: debug / info / warn / error
- [x] `service`
- [x] `message`
- [x] Flat key/value `attributes` (JSONB)

---

## 2. Core requirements (musts)

- [x] Required API contract implemented exactly
- [x] Per-entry validation for ingestion batches
- [x] Freely combinable query filters
- [x] Time-bucketed aggregation
- [x] Cursor-based pagination
- [x] Starts with `docker compose up` (no `.env` required)
- [x] README with all required sections (see §8)

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
- [x] 200 only after durable Postgres write (`ingestBuffer.enqueue` awaits flush)

### 4.4 `GET /logs` — Query

- [x] Optional, freely combinable: `service`, `level`, `since`, `until`, `attr.<key>`, `q`, `limit`, `cursor`
- [x] `attr.<key>` compared as strings; also matches stored number/boolean (`attr-filter.util.ts`)
- [x] Sort: timestamp DESC (tie-break `id DESC`)
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

- [x] Plain `docker compose up` serves all four endpoints exactly as specified
- [x] Unauthenticated on all four
- [x] No rate limit / quota / tenancy on by default
- [x] Never 200 before durable accept

Auth / rate limiting / multi-tenancy: **not implemented**. Default is the plain core service. Optional-feature README line should say **none**.

---

## 6. Performance targets (must prove)

The **grader** is the local Foothill CLI (`logs-benchmark-cli`).  
`load-test/run.ts` is **internal only** — it does not count as the official score.

### 6a. Official CLI

```bash
npx --yes github:Ahmad-Abbas-Foothill/logs-benchmark-cli --compose ./docker-compose.yml --full --seed 6122026 --runner docker --json benchmark-report.json --generator-cpus 4
```

| Flag | Meaning |
|------|---------|
| `--compose ./docker-compose.yml` | Uses this project's compose (CLI applies resource limits / override) |
| `--full` | Full run (~1M rows / ingest+query+aggregate), not a smoke |
| `--seed 6122026` | Reproducible payload (use this seed when comparing runs) |
| `--runner docker` | k6 in Docker on the compose network |
| `--json benchmark-report.json` | Machine-readable report in the repo root |
| `--generator-cpus 4` | Load-generator CPU (not the app; app stays 0.5 CPU) |

Status: **run 2026-08-18** (`benchmark-report.json`, scorer `2026-08-18.v10`).

| Category | Score | Detail |
|----------|-------|--------|
| Correctness | **15.0 / 15** | 15/15 checks |
| Performance | **39.0 / 50** | throughput **14,520/s** · errors **0.0%** · p95 **584ms** |
| Queries | **14.7 / 15** | aggregate p95 **18ms** · consistency **4/4** |
| Reliability | **20.0 / 20** | 4/4 scenarios, crash-free |
| **Total** | **88.7 / 100** | eligible, no correctness cap |

Load scenario (headline ingest): 14,520/s offered 15,000 · p95 584ms · agg p95 18ms · accepted=visible 1,742,400 · generator-limited (575 dropped iterations). Stress / spike / breakpoint also completed; k6 was the constraint on all four.

**Environment (quote with the score):** Docker Desktop **6 CPUs / 6 GiB**, machine speed **0.51x** reference, app **0.5 CPU / 256m**, Postgres **1 CPU / 1024m**, generator `grafana/k6:0.54.0` (4 CPU / 1g). Performance points are indicative on this machine.

### 6b. Internal harness (not the grader)

`npx tsx load-test/run.ts` — 1,000,000 logs. Useful for local tuning only.

| Target | Status | Measured |
|--------|--------|----------|
| ≥ 15,000 logs/sec sustained | `[x]` PASS | 15,668/s sustained (15,662/s overall) |
| No drops / crashes | `[x]` PASS | fail_batches=0, crashes=0 |
| Agg p95 < 1s | `[x]` PASS | p95=161.9ms (p50=4.3ms, p99=344.9ms, n=78) |
| Query while ingesting | `[x]` PASS | ok=31, fail=0 |
| ~1,000,000 rows | `[x]` PASS | accepted=1,000,000 |
| Queryable < 20s | `[x]` PASS | 3,217.6ms |
| 1 agg/s during ingest | `[x]` PASS | agg_ok=78 over 63.8s |

- Duration: 63.8s · Batches 2000/0
- Ingest latency: p50=4.4ms · p95=140.4ms · p99=254.1ms · max=450.1ms
- Status: `{"ingest:200":2000,"agg:200":63,"query:200":31}`

---

## 7. What graders evaluate

| Area | Status | Notes |
|------|--------|--------|
| Architecture | `[x]` | Documented in README |
| Performance | `[x]` | Official CLI `--full` **88.7** (Performance **39.0/50**, p95 584ms, 14,520/s). Internal harness also PASS (§6b) |
| Retention | `[x]` | Partman drop + `RETENTION_DAYS` at startup |
| Reliability | `[x]` | Validation, errors, edge cases |
| Code quality | `[x]` | Typed TS, layered |
| Security | `[x]` | Parameterized queries |
| Separation of concerns | `[x]` | Handlers ≠ repositories |
| Infrastructure | `[x]` | Compose + auto migrate |
| CI | `[~]` | `.github/workflows/ci.yml` + `scripts/contract-smoke.ts`; green after first GHA run |
| Documentation | `[x]` | `README.md` |

---

## 8. README (required sections)

- [x] Setup and usage
- [x] API documentation
- [x] Schema and index design
- [x] Attribute storage strategy
- [x] Retention strategy (`RETENTION_DAYS`, partman, `p_interval`)
- [x] Load-test methodology (official CLI command in §6a + seed `6122026`)
- [~] Measured performance results (internal §6b in README; official **88.7** is in §6a here — paste into README)
- [x] Known limitations
- [x] Optional features: **none**

---

## 9. Deliverables

- [~] GitHub repository with clean, incremental commit history
- [x] Working Docker Compose (`docker compose up`)
- [~] Passing CI pipeline (workflow added; needs a green GitHub Actions run)
- [x] Complete README
- [x] Official CLI `--full` run — **88.7 / 100** (see §6a)
- [ ] ~5 min video: architecture + live demo
- [ ] Demo readiness: schema, indexes, EXPLAIN, ingest/query paths

### CI smoke (obligatory)

- [x] `AUTH_ENABLED=false` — `scripts/contract-smoke.ts` (four endpoints, no credentials; Bearer ignored)
- [x] `AUTH_ENABLED=true` — skip (auth not implemented)

---

## What's left (do in this order)

1. Push so **GitHub Actions** can go green (`ci.yml`).
2. Paste the official CLI score (**88.7 / 100**, §6a) into `README.md`.
3. Record **~5 min video**.
4. Submit the **final project form**.

---

## Quick scoreboard

| Area | Status |
|------|--------|
| Core API | **Done** |
| Retention | **Done** (`RETENTION_DAYS`) |
| Docker / infra | **Done** |
| Internal load-test | **Done** (not the grader) |
| README | **Done** |
| CI | **Added** — green after push |
| Official CLI | **Done** — **88.7 / 100** (§6a); still paste into README |
| Video / form | **Not started** |
| Submission readiness | **Not ready** until CI green + README score + video + form |
