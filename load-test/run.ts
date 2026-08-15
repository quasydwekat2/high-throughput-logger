import { loadConfig, type LoadConfig } from './config.js';
import {
  getAggregate,
  getHealth,
  getLogs,
  postLogs,
} from './client.js';
import { aggregateWindow, makeBatch } from './generators.js';
import { fmtMs, fmtRate, latencyStats } from './metrics.js';

type Check = { name: string; pass: boolean; detail: string };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealthy(cfg: LoadConfig): Promise<void> {
  const deadline = Date.now() + cfg.healthTimeoutMs;
  while (Date.now() < deadline) {
    const res = await getHealth(cfg.baseUrl);
    if (res.ok) return;
    process.stdout.write('.');
    await sleep(1000);
  }
  throw new Error(`GET /health did not return 200 within ${cfg.healthTimeoutMs}ms`);
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const markerId = `lt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const nowMs = Date.now();
  const window = aggregateWindow(nowMs);
  const totalBatches = Math.ceil(cfg.totalLogs / cfg.batchSize);
  const batchIntervalMs =
    (cfg.batchSize / cfg.targetLogsPerSec) * 1000 / cfg.paceFactor;

  console.log('=== local load test (spec performance bars) ===');
  console.log(JSON.stringify({
    baseUrl: cfg.baseUrl,
    totalLogs: cfg.totalLogs,
    targetLogsPerSec: cfg.targetLogsPerSec,
    batchSize: cfg.batchSize,
    concurrency: cfg.concurrency,
    smoke: cfg.smoke,
  }, null, 2));

  process.stdout.write('waiting for /health ');
  await waitHealthy(cfg);
  console.log(' ok');

  if (cfg.warmupSec > 0) {
    const warmN = Math.min(cfg.batchSize, 200);
    const warmUntil = Date.now() + cfg.warmupSec * 1000;
    console.log(`warmup ${cfg.warmupSec}s...`);
    while (Date.now() < warmUntil) {
      await postLogs(cfg.baseUrl, makeBatch(warmN, 0, nowMs));
    }
  }

  const ingestLat: number[] = [];
  const aggLat: number[] = [];
  const queryLat: number[] = [];
  const statusCounts = new Map<string, number>();
  let accepted = 0;
  let rejected = 0;
  let failBatches = 0;
  let crashes = 0;
  let aggOk = 0;
  let aggFail = 0;
  let queryOk = 0;
  let queryFail = 0;
  let nextBatch = 0;
  let ingestDone = false;

  const bump = (key: string) => {
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
  };

  const aggQuery = new URLSearchParams({
    since: window.since,
    until: window.until,
    bucket: '1h',
    group_by: 'service',
  });
  const logsQuery = new URLSearchParams({
    service: 'checkout',
    level: 'error',
    limit: '100',
  });

  const ingestStart = Date.now();

  async function aggregateLoop(): Promise<void> {
    while (!ingestDone) {
      const res = await getAggregate(cfg.baseUrl, aggQuery);
      aggLat.push(res.ms);
      bump(`agg:${res.status}`);
      if (res.ok) aggOk += 1;
      else aggFail += 1;
      await sleep(cfg.aggregateIntervalMs);
    }
  }

  async function queryLoop(): Promise<void> {
    while (!ingestDone) {
      const res = await getLogs(cfg.baseUrl, logsQuery);
      queryLat.push(res.ms);
      bump(`query:${res.status}`);
      if (res.ok) queryOk += 1;
      else queryFail += 1;
      await sleep(cfg.queryIntervalMs);
    }
  }

  async function worker(): Promise<void> {
    for (;;) {
      const i = nextBatch++;
      if (i >= totalBatches) return;
      const start = i * cfg.batchSize;
      const n = Math.min(cfg.batchSize, cfg.totalLogs - start);
      const due = ingestStart + i * batchIntervalMs;
      const wait = due - Date.now();
      if (wait > 0) await sleep(wait);

      const marker = i === 0 || i === totalBatches - 1 ? markerId : undefined;
      const res = await postLogs(cfg.baseUrl, makeBatch(n, i, nowMs, marker));
      ingestLat.push(res.ms);
      bump(`ingest:${res.status}`);
      if (res.status === 0) {
        crashes += 1;
        failBatches += 1;
        continue;
      }
      if (!res.ok || res.body === null) {
        failBatches += 1;
        continue;
      }
      accepted += res.body.accepted;
      rejected += Array.isArray(res.body.rejected) ? res.body.rejected.length : 0;
    }
  }

  const background = Promise.all([aggregateLoop(), queryLoop()]);
  await Promise.all(Array.from({ length: cfg.concurrency }, () => worker()));
  ingestDone = true;
  await background;

  const ingestMs = Date.now() - ingestStart;
  const sustained = accepted / (ingestMs / 1000);

  const visStart = Date.now();
  let visibleMs = NaN;
  while (Date.now() - visStart < cfg.visibilityDeadlineMs) {
    const q = new URLSearchParams({ 'attr.loadtest_id': markerId, limit: '10' });
    const res = await getLogs(cfg.baseUrl, q);
    const rows = res.body?.logs ?? [];
    if (res.ok && rows.length > 0) {
      visibleMs = Date.now() - visStart;
      break;
    }
    await sleep(250);
  }

  const ingestStats = latencyStats(ingestLat);
  const aggStats = latencyStats(aggLat);
  const queryStats = latencyStats(queryLat);
  const expectedRows = cfg.totalLogs;

  const checks: Check[] = [
    {
      name: `sustain >= ${cfg.targetLogsPerSec} logs/s`,
      pass: sustained >= cfg.targetLogsPerSec,
      detail: fmtRate(sustained),
    },
    {
      name: 'no dropped batches / crashes',
      pass: failBatches === 0 && crashes === 0,
      detail: `fail_batches=${failBatches} crashes=${crashes}`,
    },
    {
      name: `aggregate p95 < ${cfg.aggregateP95MaxMs}ms`,
      pass: Number.isFinite(aggStats.p95) && aggStats.p95 < cfg.aggregateP95MaxMs,
      detail: `p95=${fmtMs(aggStats.p95)} n=${aggStats.n}`,
    },
    {
      name: 'query OK while ingesting',
      pass: queryOk > 0 && queryFail === 0,
      detail: `ok=${queryOk} fail=${queryFail}`,
    },
    {
      name: `~${expectedRows} accepted rows`,
      pass: accepted >= expectedRows,
      detail: `accepted=${accepted} rejected=${rejected}`,
    },
    {
      name: `new data queryable < ${cfg.visibilityDeadlineMs}ms`,
      pass: Number.isFinite(visibleMs) && visibleMs < cfg.visibilityDeadlineMs,
      detail: Number.isFinite(visibleMs) ? fmtMs(visibleMs) : 'timeout',
    },
    {
      name: '1 aggregate request/sec during ingest',
      pass: aggOk >= Math.max(1, Math.floor(ingestMs / 1000) - 2),
      detail: `agg_ok=${aggOk} over ${(ingestMs / 1000).toFixed(1)}s`,
    },
  ];

  console.log('\n=== results ===');
  console.log(`duration: ${(ingestMs / 1000).toFixed(1)}s`);
  console.log(`batches: ${totalBatches}  ingest latency p50=${fmtMs(ingestStats.p50)} p95=${fmtMs(ingestStats.p95)} p99=${fmtMs(ingestStats.p99)} max=${fmtMs(ingestStats.max)}`);
  console.log(`aggregate p50=${fmtMs(aggStats.p50)} p95=${fmtMs(aggStats.p95)} p99=${fmtMs(aggStats.p99)}`);
  console.log(`query     p50=${fmtMs(queryStats.p50)} p95=${fmtMs(queryStats.p95)}`);
  console.log('status:', Object.fromEntries(statusCounts));
  console.log('\n=== checks (spec) ===');
  for (const c of checks) {
    console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  (${c.detail})`);
  }

  if (checks.some((c) => !c.pass)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
