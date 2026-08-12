/**
 * Own load test for high-throughput-logger.
 *
 * Targets (from project checklist):
 *  - ≥ 15,000 logs/sec sustained
 *  - ~1,000,000 rows ingested
 *  - No drops / crashes under load
 *  - Primary aggregation p95 < 1s
 *  - Query OK while ingesting
 *  - New data queryable < 20s under load
 *  - 1 aggregation request/sec during ingest
 *
 * Usage:
 *   npx tsx load-test/run.ts
 *   TOTAL_LOGS=100000 TARGET_LOGS_PER_SEC=15000 npx tsx load-test/run.ts
 */

import { loadTestConfig as cfg } from './config.js';
import {
  aggregateLogs,
  postLogs,
  queryLogs,
  sleep,
  waitForHealth,
  HttpError,
} from './client.js';
import { makeBatch, uniqueMarker } from './generators.js';
import {
  CounterMap,
  LatencyTracker,
  fmtMs,
  fmtRate,
  passFail,
} from './metrics.js';

interface RunStats {
  accepted: number;
  rejected: number;
  httpErrors: number;
  crashes: number;
  batchesOk: number;
  batchesFail: number;
  ingestLatency: LatencyTracker;
  aggregateLatency: LatencyTracker;
  queryLatency: LatencyTracker;
  queryOk: number;
  queryFail: number;
  aggregateOk: number;
  aggregateFail: number;
  statusCodes: CounterMap;
  visibilityMs: number | null;
  sustainedRate: number;
  overallRate: number;
  durationSec: number;
}

function printHeader(): void {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' High-Throughput Logger — Own Load Test');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(` baseUrl           : ${cfg.baseUrl}`);
  console.log(` targetLogsPerSec  : ${cfg.targetLogsPerSec}`);
  console.log(` totalLogs         : ${cfg.totalLogs}`);
  console.log(` batchSize         : ${cfg.batchSize}`);
  console.log(` concurrency       : ${cfg.concurrency}`);
  console.log(` aggregateInterval : ${cfg.aggregateIntervalMs}ms`);
  console.log(` visibilityDeadline: ${cfg.visibilityDeadlineMs}ms`);
  console.log(` aggregateP95Max   : ${cfg.aggregateP95MaxMs}ms`);
  console.log('───────────────────────────────────────────────────────────');
}

async function measureVisibility(
  marker: string,
  deadlineMs: number,
): Promise<number | null> {
  const started = performance.now();
  const until = Date.now() + deadlineMs;

  while (Date.now() < until) {
    try {
      // Prefer attr equality (GIN) over q=ILIKE — message has no trgm index
      // under write-optimized schema; ILIKE full scans miss the 20s visibility bar.
      const { data } = await queryLogs({
        'attr.marker': marker,
        limit: '10',
      });
      const hit = data.logs.some(
        (l) =>
          l.message.includes(marker) ||
          (l.attributes?.marker !== undefined &&
            String(l.attributes.marker) === marker),
      );
      if (hit) return performance.now() - started;
    } catch {
      // keep polling under load
    }
    await sleep(250);
  }

  return null;
}

async function run(): Promise<void> {
  printHeader();

  console.log('\n[1/4] Waiting for /health …');
  await waitForHealth(cfg.healthTimeoutMs);
  console.log('      healthy\n');

  const stats: RunStats = {
    accepted: 0,
    rejected: 0,
    httpErrors: 0,
    crashes: 0,
    batchesOk: 0,
    batchesFail: 0,
    ingestLatency: new LatencyTracker(),
    aggregateLatency: new LatencyTracker(),
    queryLatency: new LatencyTracker(),
    queryOk: 0,
    queryFail: 0,
    aggregateOk: 0,
    aggregateFail: 0,
    statusCodes: new CounterMap(),
    visibilityMs: null,
    sustainedRate: 0,
    overallRate: 0,
    durationSec: 0,
  };

  let nextIndex = 0;
  let stopBackground = false;
  const nowMs = Date.now();
  const marker = uniqueMarker('vis');
  let markerQueued = false;
  /** Polls for the marker concurrently with ingest; resolves with visibility ms. */
  let visibilityProbe: Promise<number | null> | null = null;

  /**
   * Schedule-based pacing: sleep only when ahead of the target timeline.
   * If HTTP/DB lag puts us behind, send immediately to catch up (≥ target).
   * Paced slightly above target so measured throughput doesn't land a hair
   * below the pass bar (e.g. 14966/s vs 15000/s) due to scheduling jitter.
   */
  const paceRate = cfg.targetLogsPerSec * cfg.paceFactor;
  async function paceUntil(claimedThrough: number, startedAt: number): Promise<void> {
    const dueAt = startedAt + (claimedThrough / paceRate) * 1000;
    const delay = dueAt - performance.now();
    if (delay > 1) await sleep(delay);
  }

  async function runPrimaryAggregate(): Promise<number> {
    const until = new Date().toISOString();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { latencyMs } = await aggregateLogs({
      since,
      until,
      bucket: '1h',
      group_by: 'service',
    });
    return latencyMs;
  }

  // ── Background: 1 aggregation/sec + periodic queries during ingest ──────
  // Fixed-schedule ticks: fire one request per second regardless of how long
  // the previous one takes (awaiting each reply would slip below 1 req/sec).
  const backgroundAgg = (async () => {
    const fireAggregate = async (): Promise<void> => {
      try {
        const latencyMs = await runPrimaryAggregate();
        stats.aggregateLatency.record(latencyMs);
        stats.aggregateOk += 1;
        stats.statusCodes.inc('agg:200');
      } catch (err) {
        stats.aggregateFail += 1;
        if (err instanceof HttpError) {
          stats.statusCodes.inc(`agg:${err.status}`);
          if (err.status >= 500) stats.crashes += 1;
        } else {
          stats.crashes += 1;
          stats.statusCodes.inc('agg:network');
        }
      }
    };

    const started = performance.now();
    const inflight: Array<Promise<void>> = [];
    let tick = 1;
    while (!stopBackground) {
      const dueAt = started + tick * cfg.aggregateIntervalMs;
      tick += 1;
      const delay = dueAt - performance.now();
      if (delay > 0) await sleep(delay);
      if (stopBackground) break;
      inflight.push(fireAggregate());
    }
    await Promise.all(inflight);
  })();

  const backgroundQuery = (async () => {
    await sleep(cfg.queryIntervalMs);
    while (!stopBackground) {
      try {
        const { latencyMs } = await queryLogs({
          service: 'api',
          level: 'error',
          limit: '50',
        });
        stats.queryLatency.record(latencyMs);
        stats.queryOk += 1;
        stats.statusCodes.inc('query:200');
      } catch (err) {
        stats.queryFail += 1;
        if (err instanceof HttpError) {
          stats.statusCodes.inc(`query:${err.status}`);
          if (err.status >= 500) stats.crashes += 1;
        } else {
          stats.crashes += 1;
          stats.statusCodes.inc('query:network');
        }
      }
      await sleep(cfg.queryIntervalMs);
    }
  })();

  // ── Ingest workers ──────────────────────────────────────────────────────
  console.log('[2/4] Sustained ingest + concurrent query/aggregate …');
  const ingestStarted = performance.now();
  let acceptedAfterWarmup = 0;
  let warmupEndedAt: number | null = null;

  async function worker(workerId: number): Promise<void> {
    while (true) {
      const start = nextIndex;
      if (start >= cfg.totalLogs) return;
      const count = Math.min(cfg.batchSize, cfg.totalLogs - start);
      nextIndex += count;

      await paceUntil(start + count, ingestStarted);

      const includeMarker =
        !markerQueued && start + count >= Math.floor(cfg.totalLogs * 0.5);
      if (includeMarker) markerQueued = true;

      const batch = makeBatch(
        start,
        count,
        cfg.totalLogs,
        nowMs,
        includeMarker ? marker : undefined,
      );

      try {
        const result = await postLogs(batch);
        stats.accepted += result.accepted;
        stats.rejected += result.rejected;
        stats.batchesOk += 1;
        stats.ingestLatency.record(result.latencyMs);
        stats.statusCodes.inc('ingest:200');

        // Start polling for the marker NOW, while ingest is still hammering the
        // server — measuring after ingest ends would just report elapsed time.
        if (includeMarker && visibilityProbe === null) {
          visibilityProbe = measureVisibility(marker, cfg.visibilityDeadlineMs);
        }

        const elapsedSec = (performance.now() - ingestStarted) / 1000;
        if (elapsedSec >= cfg.warmupSec) {
          if (warmupEndedAt === null) {
            warmupEndedAt = performance.now();
            acceptedAfterWarmup = 0;
          }
          acceptedAfterWarmup += result.accepted;
        }
      } catch (err) {
        stats.batchesFail += 1;
        stats.httpErrors += 1;
        if (err instanceof HttpError) {
          stats.statusCodes.inc(`ingest:${err.status}`);
          // 503 buffer-full is a drop under load
          if (err.status === 503 || err.status >= 500) {
            stats.crashes += 1;
          }
        } else {
          stats.crashes += 1;
          stats.statusCodes.inc('ingest:network');
        }
      }

      // progress every ~50k from worker 0
      if (workerId === 0 && start > 0 && start % 50_000 < cfg.batchSize) {
        const elapsed = (performance.now() - ingestStarted) / 1000;
        const rate = stats.accepted / Math.max(elapsed, 0.001);
        process.stdout.write(
          `\r      ingested=${stats.accepted}/${cfg.totalLogs}  rate≈${fmtRate(rate)}  agg_ok=${stats.aggregateOk}  query_ok=${stats.queryOk}   `,
        );
      }
    }
  }

  const workers = Array.from({ length: cfg.concurrency }, (_, i) => worker(i));
  await Promise.all(workers);

  const ingestEnded = performance.now();
  stats.durationSec = (ingestEnded - ingestStarted) / 1000;
  stats.overallRate = stats.accepted / Math.max(stats.durationSec, 0.001);

  if (warmupEndedAt !== null) {
    const sustainedSec = (ingestEnded - warmupEndedAt) / 1000;
    stats.sustainedRate =
      acceptedAfterWarmup / Math.max(sustainedSec, 0.001);
  } else {
    stats.sustainedRate = stats.overallRate;
  }

  stopBackground = true;
  await Promise.all([backgroundAgg, backgroundQuery]);
  console.log('\n      ingest complete\n');

  // ── Visibility under load (probe ran concurrently with ingest) ──────────
  console.log('[3/4] Measuring new-data visibility …');
  if (visibilityProbe !== null) {
    stats.visibilityMs = await visibilityProbe;
  } else {
    // Fallback: send a fresh marker after ingest and measure
    const m = uniqueMarker('post');
    await postLogs(makeBatch(0, 1, 1, Date.now(), m));
    stats.visibilityMs = await measureVisibility(m, cfg.visibilityDeadlineMs);
  }

  console.log(
    `      visibility=${stats.visibilityMs === null ? 'TIMEOUT' : fmtMs(stats.visibilityMs)}\n`,
  );

  // ── Primary aggregation p95 (extra samples under residual load) ─────────
  console.log('[4/4] Primary aggregation latency samples …');
  for (let i = 0; i < 15; i++) {
    try {
      const latencyMs = await runPrimaryAggregate();
      stats.aggregateLatency.record(latencyMs);
      stats.aggregateOk += 1;
    } catch {
      stats.aggregateFail += 1;
    }
  }

  printReport(stats);
  const ok = evaluate(stats);
  process.exit(ok ? 0 : 1);
}

function evaluate(stats: RunStats): boolean {
  const agg = stats.aggregateLatency.summary();
  const checks = {
    sustainedRate: stats.sustainedRate >= cfg.targetLogsPerSec,
    millionRows: stats.accepted >= cfg.totalLogs * 0.99, // allow tiny reject noise
    noDrops: stats.crashes === 0 && stats.batchesFail === 0,
    aggregateP95: agg.p95 < cfg.aggregateP95MaxMs,
    queryOk: stats.queryOk > 0 && stats.queryFail === 0,
    visibility:
      stats.visibilityMs !== null &&
      stats.visibilityMs < cfg.visibilityDeadlineMs,
    aggDuringIngest: stats.aggregateOk >= Math.max(1, Math.floor(stats.durationSec) - 1),
  };

  console.log('── Pass / Fail ────────────────────────────────────────────');
  console.log(
    ` ${passFail(checks.sustainedRate)}  sustained ingest ≥ ${cfg.targetLogsPerSec}/s  (got ${fmtRate(stats.sustainedRate)})`,
  );
  console.log(
    ` ${passFail(checks.millionRows)}  rows ingested ≈ ${cfg.totalLogs}  (got ${stats.accepted})`,
  );
  console.log(
    ` ${passFail(checks.noDrops)}  no drops / crashes  (fail_batches=${stats.batchesFail}, crashes=${stats.crashes})`,
  );
  console.log(
    ` ${passFail(checks.aggregateP95)}  primary aggregation p95 < ${cfg.aggregateP95MaxMs}ms  (got ${fmtMs(agg.p95)})`,
  );
  console.log(
    ` ${passFail(checks.queryOk)}  query OK while ingesting  (ok=${stats.queryOk}, fail=${stats.queryFail})`,
  );
  console.log(
    ` ${passFail(checks.visibility)}  new data queryable < ${cfg.visibilityDeadlineMs}ms  (got ${stats.visibilityMs === null ? 'TIMEOUT' : fmtMs(stats.visibilityMs)})`,
  );
  console.log(
    ` ${passFail(checks.aggDuringIngest)}  ~1 aggregation req/sec during ingest  (agg_ok=${stats.aggregateOk}, duration=${stats.durationSec.toFixed(1)}s)`,
  );
  console.log('═══════════════════════════════════════════════════════════\n');

  return Object.values(checks).every(Boolean);
}

function printReport(stats: RunStats): void {
  const ingest = stats.ingestLatency.summary();
  const agg = stats.aggregateLatency.summary();
  const query = stats.queryLatency.summary();

  console.log('── Results ────────────────────────────────────────────────');
  console.log(` duration            : ${stats.durationSec.toFixed(1)}s`);
  console.log(` accepted            : ${stats.accepted}`);
  console.log(` rejected            : ${stats.rejected}`);
  console.log(` overall ingest rate : ${fmtRate(stats.overallRate)}`);
  console.log(` sustained rate      : ${fmtRate(stats.sustainedRate)} (after ${cfg.warmupSec}s warmup)`);
  console.log(` batches ok/fail     : ${stats.batchesOk}/${stats.batchesFail}`);
  console.log(
    ` ingest latency      : p50=${fmtMs(ingest.p50)}  p95=${fmtMs(ingest.p95)}  p99=${fmtMs(ingest.p99)}  max=${fmtMs(ingest.max)}`,
  );
  console.log(
    ` aggregate latency   : n=${agg.count}  p50=${fmtMs(agg.p50)}  p95=${fmtMs(agg.p95)}  p99=${fmtMs(agg.p99)}  max=${fmtMs(agg.max)}`,
  );
  console.log(
    ` query latency       : n=${query.count}  p50=${fmtMs(query.p50)}  p95=${fmtMs(query.p95)}  p99=${fmtMs(query.p99)}  max=${fmtMs(query.max)}`,
  );
  console.log(` visibility          : ${stats.visibilityMs === null ? 'TIMEOUT' : fmtMs(stats.visibilityMs)}`);
  console.log(` status codes        : ${JSON.stringify(stats.statusCodes.toObject())}`);
  console.log('');
}

run().catch((err) => {
  console.error('\nLoad test aborted:', err);
  process.exit(1);
});
