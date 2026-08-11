# Log Ingestion and Query Service — Agent Brief

Use this file as the source of truth when changing this project.
If a request conflicts with this document, follow this document unless the user explicitly overrides it.

---

## What this project is

Build a **simplified Datadog / Grafana Loki**: applications send structured logs to an API; the service stores them efficiently and makes them searchable and aggregatable.

Three concerns:

1. **Ingestion** — accept individual or batched logs, validate per entry, store efficiently
2. **Querying** — filter + paginate logs; time-bucket aggregation with optional group-by
3. **Retention** — configurable deletion of expired data (not infinite storage)

**Hard constraint:** correctness without performance is incomplete. The system is load-tested with **>1M rows**.

---

## Non-negotiable runtime contract

### How graders start the service

```bash
docker compose up
```

No `.env`, no args, no manual setup. Plain compose must yield the core unauthenticated service.

### Ports

| Where | Port |
| --- | --- |
| App inside container | `8080` |
| Host exposure | `localhost:8080` |

### Resource limits (grading environment)

| Container | CPU | RAM |
| --- | --- | --- |
| Application | 0.5 | 256 MB |
| PostgreSQL | 1 | 1 GB |

PostgreSQL must remain the **source of truth** for reads and writes. Extra infra is allowed only as helpers.

### Health gate (`GET /health`)

Return **HTTP 200** only when:

1. DB connection is established
2. Migrations have been applied
3. Service is ready to accept logs

Load generator polls this before starting.

---

## Required API (exact contract)

You may add endpoints. You must **never** break, rename, or reshape these four.

### 1. `GET /health`

- Always unauthenticated (even if auth is enabled)
- 200 when ready; any body is fine

### 2. `POST /logs` — ingest batch

Request:

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

A batch of one entry is valid.

#### Per-entry validation

| Field | Rules |
| --- | --- |
| `timestamp` | Required; valid ISO 8601; **not more than 5 minutes in the future** |
| `level` | Required; one of `debug` \| `info` \| `warn` \| `error` |
| `service` | Required; non-empty string |
| `message` | Required; non-empty string |
| `attributes` | Optional; **flat** object only; values = string \| number \| boolean; **no** nested objects/arrays |

#### Batch behavior (critical)

- Invalid entries must **not** fail the whole batch
- Accept valid, reject invalid
- Return index + reason for each rejected entry

#### Status codes

| Condition | Status |
| --- | --- |
| At least one entry accepted | **200** |
| All entries rejected | **400** |
| Malformed JSON / wrong top-level shape | **400** |

Response shape:

```json
{
  "accepted": 9,
  "rejected": [
    { "index": 3, "reason": "invalid level: 'critical'" }
  ]
}
```

**Never return 200 for a batch that was not durably accepted.**

### 3. `GET /logs` — query

All params optional; freely combinable.

| Param | Meaning | Example |
| --- | --- | --- |
| `service` | Exact service match | `service=checkout` |
| `level` | Exact level match | `level=error` |
| `since` | Inclusive start | `since=2026-07-20T14:00:00Z` |
| `until` | Exclusive end | `until=2026-07-20T15:00:00Z` |
| `attr.<key>` | Attribute equality **as strings** | `attr.user_id=42` |
| `q` | Case-insensitive substring on `message` | `q=declined` |
| `limit` | Max results; default **100**, max **1000** | `limit=500` |
| `cursor` | Opaque cursor from prior response | `cursor=eyJpZCI6...` |

#### Sorting

- `timestamp` **DESC**
- Deterministic when timestamps tie (use a stable secondary key, e.g. `id`)

#### Response

```json
{
  "logs": [
    {
      "id": "any-unique-id",
      "timestamp": "2026-07-20T14:32:01.123Z",
      "level": "error",
      "service": "checkout",
      "message": "payment declined",
      "attributes": { "user_id": "42" }
    }
  ],
  "next_cursor": "eyJpZCI6..."
}
```

- `next_cursor` is `null` when no more results
- Cursor format is implementation-defined; treat as opaque

#### Invalid query params → `400`

```json
{ "error": "<description>" }
```

Invalid examples: bad timestamps, `until < since`, bad level, non-numeric / out-of-range limit, malformed cursor.

### 4. `GET /logs/aggregate` — time buckets

Same filters as query: `service`, `level`, `attr.<key>`, `q`

Plus required aggregation params:

| Param | Required | Meaning | Values |
| --- | --- | --- | --- |
| `since` | Yes | Inclusive start | ISO timestamp |
| `until` | Yes | Exclusive end | ISO timestamp |
| `bucket` | Yes | Bucket size | `1m` \| `5m` \| `1h` \| `1d` |
| `group_by` | No | Group dimension | `service` or `level` |

#### Response rules

- One row per bucket (+ group) combination
- Ordered by bucket `start` **ASC**
- Empty buckets may be omitted
- If no `group_by`, `group` must be `null`

```json
{
  "buckets": [
    { "start": "2026-07-20T14:00:00Z", "group": "checkout", "count": 118 },
    { "start": "2026-07-20T14:00:00Z", "group": "auth", "count": 42 },
    { "start": "2026-07-20T14:01:00Z", "group": "checkout", "count": 97 }
  ]
}
```

Invalid params → same `400` `{ "error": "..." }` shape as `GET /logs`.

---

## Log entry model (domain)

Every stored/returned log has:

- `timestamp`
- `level`: `debug` | `info` | `warn` | `error`
- `service` (string)
- `message` (string)
- `attributes`: flat map of string/number/boolean

**Attribute storage strategy is a major design decision.** Prefer a strategy that supports:

- Fast equality filters on `attr.<key>`
- High ingest throughput under tight CPU/RAM
- Safe parameterized SQL (SQL injection = disqualifying)

---

## Performance targets (must meet)

| Target | Value |
| --- | --- |
| Sustained ingest | **≥ 15,000 logs/sec** (higher earns credit: 20k, 25k+) |
| Dropped requests / crashes | Avoid during sustained ingest |
| Primary aggregate query | **p95 < 1s** |
| Concurrent ingest + query | Queries stay fast while ingest runs |
| Dataset size | ~**1,000,000** rows (~1 month of data) |
| Freshness | Newly ingested data queryable within **20s** |
| Aggregate QPS during ingest test | **~1 req/sec** |

Measure and document results. Assumptions without measurements are insufficient for the README.

---

## Retention

- Logs must expire under a **configurable retention policy**
- Deletion must avoid long locks, severe bloat, and major ingest disruption
- Default should work with zero config; document the knob (e.g. days)

---

## Optional features — Golden Rule

**Extras are additive, never subtractive.**

An optional feature may add endpoints/headers/fields/config. It must **never**:

- Remove/rename a required endpoint
- Change required response shapes/types
- Add a new **required** request param/header on a required endpoint
- Make a previously-valid core request fail

If it cannot satisfy this → **disabled by default**.

### Default posture (graded config)

`docker compose up` with no config must:

- Serve all four required endpoints exactly
- Accept **unauthenticated** requests on all four
- Apply **no** rate limit / quota / tenancy restriction the loadgen can hit

### Auth (if implemented)

| Variable | Default | Meaning |
| --- | --- | --- |
| `AUTH_ENABLED` | `false` | Master switch |
| `LOADGEN_API_KEY` | unset | Seeded key with full ingest+query |

Rules:

1. `AUTH_ENABLED` defaults **false** → behaves as plain core service
2. When `AUTH_ENABLED=true` and `LOADGEN_API_KEY` set → **idempotently seed** that key at startup (before healthy) with full permissions; restart must not invalidate it
3. Seeding is startup/migration only — no manual admin/SQL step
4. If auth on but key unset → still start healthy; just no seeded key
5. Credential transport: **`Authorization: Bearer <key>`** required to work; `X-API-Key` optional extra
6. Credentials never in query string or body
7. Status: missing/malformed → **401**; valid but insufficient scope → **403**; rate/quota → **429** + `Retry-After`
8. Auth failures never **500**, never **200** with empty results pretending success
9. `GET /health` always unauthenticated
10. When `AUTH_ENABLED=false`, an unrecognized `Authorization` header must be **ignored**, not rejected (loadgen always sends Bearer)

### Multi-tenancy (if implemented)

- Seeded loadgen key → exactly one tenant
- All four endpoints operate within that tenant transparently
- Tenant is **never** a required request param
- Response shapes unchanged

### Rate limiting / backpressure (if implemented)

- Off by default, **or** exempt the seeded loadgen key
- Shedding with 429/503 + `Retry-After` is OK engineering, but shed requests do **not** count as ingested throughput

### CI for optional auth

Pipeline must smoke-test:

1. `AUTH_ENABLED=false` — all four endpoints without credentials
2. If auth exists: `AUTH_ENABLED=true` + `LOADGEN_API_KEY` — data endpoints work with Bearer, **401** without it

### README for optionals

List every optional feature, default state, env vars, and confirm plain `docker compose up` = core service.

---

## Deliverables checklist

| Deliverable | Notes |
| --- | --- |
| GitHub repo | Clean incremental commit history |
| `docker compose up` | Works first run; migrations automatic |
| CI pipeline | Meaningful build + test + contract smoke |
| README | Setup, API, schema, indexes, attributes, retention, load-test method + measured results, limitations, optionals |
| Demo readiness | Explain architecture, indexes, EXPLAIN plans, code paths |
| ~5 min video | Architecture + live demo |

Submit load tests at: https://loadgen.foothilltech.net/  
(Multiple submissions allowed for tuning.)

---

## What evaluators care about

| Area | Focus |
| --- | --- |
| Architecture | Schema, attribute strategy, data flow, structure |
| Performance | Indexes for real query patterns, ingest, latency under concurrency |
| Retention | Safe expiry without wrecking ingest |
| Reliability | Validation, malformed input, empty ranges, bad cursors |
| Code quality | Readable TypeScript, strong typing, maintainable layers |
| Security | Parameterized queries; dynamic SQL must be injection-safe |
| Separation of concerns | Query-building/persistence **out of** HTTP handlers |
| Infra | Compose + auto migrations |
| CI | Real validation, not a noop |
| Docs | Clear reasoning + measured numbers |
| Polish | Useful extras that obey the loadgen contract |

---

## Agent operating rules (how to work in this repo)

When the user asks to do something, agents should:

1. **Protect the contract** — never break the four endpoints’ paths, status codes, or response shapes.
2. **Keep zero-config working** — optionals default off; plain compose must still grade cleanly.
3. **Prefer performance under limits** — design for 0.5 CPU / 256 MB app and 1 CPU / 1 GB Postgres.
4. **Separate layers** — handlers → services/validation → repositories/SQL; no business SQL in route handlers.
5. **Validate per entry on ingest** — partial acceptance; never all-or-nothing on invalid members.
6. **Use parameterized SQL** — no string-concat of user values into SQL.
7. **Make data durable before 200** on ingest.
8. **Document measurements** in README when changing performance-related behavior.
9. **Do not invent required request params** on core endpoints.
10. **Check existing code** (`src/`, migrations, `docker-compose.yml`, `check.md`) before rewriting; extend the current design unless the user asks for a redesign.

### Typical task mapping

| User asks… | Agent should… |
| --- | --- |
| Fix ingest / validation | Touch batch validation + ingest path; preserve partial accept |
| Faster ingest | Buffering / COPY / batching / Postgres tuning — stay within resource limits |
| Faster query / aggregate | Indexes, partition pruning, attribute access path, EXPLAIN |
| Retention | Partition drop or equivalent; avoid long locks |
| Auth / tenancy / rate limit | Off by default; follow auth env + Bearer rules above |
| CI | Build + unit/integration + contract smoke for AUTH off (and on if auth exists) |
| README | Cover all required sections including measured load results |
| Loadgen portal issues | Verify `/health`, port 8080, response shapes, no accidental auth/rate limit |

### Out of scope unless requested

- Changing the required API paths or response field names
- Making auth/rate limits on by default
- Replacing Postgres as source of truth
- Returning 200 for non-durable ingest
- Failing entire batches because one entry is invalid

---

## Stretch goals (optional, after core is solid)

Dashboard, metrics, alerting webhooks, live-tail, pre-aggregated rollups, query language, multi-tenancy, compression, rate limiting, DLQ, backpressure, observability — all must obey the optional-features contract and be documented.

---

## Quick mental model

```
Clients / Loadgen
       │
       ▼
  App :8080  (TypeScript)
  /health  /logs  /logs (GET)  /logs/aggregate
       │
       ▼
  PostgreSQL (source of truth)
  schema + indexes + retention (e.g. partitions)
```

Success = **exact API contract** + **durable high-throughput ingest** + **fast filtered/aggregate queries** under **tight container limits**, started by **`docker compose up` alone**.
