# Own Load Tests

Standalone load-test suite for the high-throughput logger. Proves the performance checklist targets against a running stack (`docker compose up`).

## Targets

| Check | Threshold |
|-------|-----------|
| Sustained ingest | ≥ 15,000 logs/sec |
| Dataset size | ~1,000,000 rows (~1 month of timestamps) |
| Reliability | No drops / crashes under load |
| Primary aggregation | p95 &lt; 1s |
| Concurrent query | Queries succeed while ingesting |
| Visibility | New data queryable &lt; 20s under load |
| Aggregation cadence | ~1 aggregation request/sec during ingest |

## Prerequisites

Dev stack (app via `Dockerfile.dev`):

```bash
npm run docker:up
# or: docker compose up --build -d postgres migrate app
# wait until GET http://localhost:8080/health → 200
```

## Run (Docker — recommended locally)

Starts the stack if needed, then runs the `load-test` compose service:

```bash
npm run docker:load-test
# smoke:
npm run docker:load-test:smoke
```

Or:

```powershell
.\scripts\run-load-test.ps1
.\scripts\run-load-test.ps1 -Smoke
```

```bash
./scripts/run-load-test.sh
./scripts/run-load-test.sh --smoke
```

## Run (host Node)

From the repo root (stack already up):

```bash
npm run load-test
```

Or directly:

```bash
npx tsx load-test/run.ts
```

### Quick smoke (smaller / faster)

```bash
npm run load-test:smoke
```

### Full checklist run (~1M rows)

```bash
TOTAL_LOGS=1000000 TARGET_LOGS_PER_SEC=15000 BATCH_SIZE=500 CONCURRENCY=32 npm run load-test
```

## Environment knobs

| Variable | Default | Meaning |
|----------|---------|---------|
| `BASE_URL` | `http://localhost:8080` | API base |
| `TARGET_LOGS_PER_SEC` | `15000` | Sustained ingest target |
| `TOTAL_LOGS` | `1000000` | Rows to send |
| `BATCH_SIZE` | `500` | Logs per `POST /logs` |
| `CONCURRENCY` | `32` | Parallel ingest workers |
| `AGGREGATE_INTERVAL_MS` | `1000` | Aggregation cadence during ingest |
| `QUERY_INTERVAL_MS` | `2000` | Query cadence during ingest |
| `VISIBILITY_DEADLINE_MS` | `20000` | Max wait for new data to appear |
| `AGGREGATE_P95_MAX_MS` | `1000` | Pass bar for aggregation p95 |
| `WARMUP_SEC` | `5` | Seconds excluded from sustained-rate calc |
| `HEALTH_TIMEOUT_MS` | `120000` | Wait for `/health` |

## What the script does

1. Polls `/health` until ready.
2. Starts concurrent ingest workers paced to `TARGET_LOGS_PER_SEC`.
3. While ingesting:
   - fires `GET /logs/aggregate` once per second
   - periodically runs `GET /logs` filters
   - injects a unique marker mid-run for visibility
4. Measures marker visibility latency under load.
5. Prints latency percentiles + PASS/FAIL for every checklist item.
6. Exits `0` only if all checks pass.

## Interpreting failures

- **sustained ingest FAIL** — raise `BATCH_SIZE` / `CONCURRENCY`, or tune app buffer (`FLUSH_BATCH_SIZE`, `QUEUE_MAX_SIZE`).
- **no drops FAIL** — look for `ingest:503` (buffer full) or `5xx` in the status map.
- **aggregation p95 FAIL** — indexes / partition pruning / pool size; reduce concurrent load or optimize aggregate SQL.
- **visibility TIMEOUT** — buffer flush lag (`FLUSH_INTERVAL_MS`) or DB write backlog.
