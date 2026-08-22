import { loadConfig } from './config.js';
import {
  getAggregate,
  getHealth,
  getLogs,
  postLogs,
} from './client.js';
import { aggregateWindow, makeBatch } from './generators.js';
import { fmtMs, fmtNum, fmtRate, latencyStats } from './metrics.js';
import {
  beginWait,
  endWait,
  printBanner,
  printReport,
  startProgress,
  waitHealthyPretty,
  warmupPretty,
  type Check,
} from './report.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const markerId = `lt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const nowMs = Date.now();
  const window = aggregateWindow(nowMs);
  const totalBatches = Math.ceil(cfg.totalLogs / cfg.batchSize);
  const batchIntervalMs =
    (cfg.batchSize / cfg.targetLogsPerSec) * 1000 / cfg.paceFactor;

  printBanner(cfg);

  await waitHealthyPretty(
    async () => (await getHealth(cfg.baseUrl)).ok,
    cfg.healthTimeoutMs,
    sleep,
  );

  await warmupPretty(cfg.warmupSec, async () => {
    const warmN = Math.min(cfg.batchSize, 200);
    await postLogs(cfg.baseUrl, makeBatch(warmN, 0, nowMs));
  });

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
  const stopProgress = startProgress(() => ({
    done: Math.min(nextBatch, totalBatches),
    total: totalBatches,
    accepted,
    started: ingestStart,
  }));

  async function aggregateLoop(): Promise<void> {
    let nextAt = Date.now();
    while (!ingestDone) {
      const wait = nextAt - Date.now();
      if (wait > 0) await sleep(wait);
      if (ingestDone) break;
      const res = await getAggregate(cfg.baseUrl, aggQuery);
      aggLat.push(res.ms);
      bump(`agg:${res.status}`);
      if (res.ok) aggOk += 1;
      else aggFail += 1;
      nextAt += cfg.aggregateIntervalMs;
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
  stopProgress();
  await background;

  const ingestMs = Date.now() - ingestStart;
  const sustained = accepted / (ingestMs / 1000);

  beginWait('visible');
  process.stdout.write('waiting');
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
    process.stdout.write('.');
    await sleep(250);
  }
  endWait(Number.isFinite(visibleMs), Number.isFinite(visibleMs) ? fmtMs(visibleMs) : 'timeout');

  const ingestStats = latencyStats(ingestLat);
  const aggStats = latencyStats(aggLat);
  const queryStats = latencyStats(queryLat);
  const expectedRows = cfg.totalLogs;

  const checks: Check[] = [
    {
      name: `sustain >= ${fmtNum(cfg.targetLogsPerSec)} logs/s`,
      pass: sustained >= cfg.targetLogsPerSec,
      detail: fmtRate(sustained),
    },
    {
      name: 'no dropped batches / crashes',
      pass: failBatches === 0 && crashes === 0,
      detail: `fail ${fmtNum(failBatches)}  crashes ${fmtNum(crashes)}`,
    },
    {
      name: `aggregate p95 < ${cfg.aggregateP95MaxMs}ms`,
      pass: Number.isFinite(aggStats.p95) && aggStats.p95 < cfg.aggregateP95MaxMs,
      detail: `p95 ${fmtMs(aggStats.p95)}  n ${fmtNum(aggStats.n)}`,
    },
    {
      name: 'query OK while ingesting',
      pass: queryOk > 0 && queryFail === 0,
      detail: `ok ${fmtNum(queryOk)}  fail ${fmtNum(queryFail)}`,
    },
    {
      name: `~${fmtNum(expectedRows)} accepted rows`,
      pass: accepted >= expectedRows,
      detail: `accepted ${fmtNum(accepted)}  rejected ${fmtNum(rejected)}`,
    },
    {
      name: `new data queryable < ${cfg.visibilityDeadlineMs}ms`,
      pass: Number.isFinite(visibleMs) && visibleMs < cfg.visibilityDeadlineMs,
      detail: Number.isFinite(visibleMs) ? fmtMs(visibleMs) : 'timeout',
    },
    {
      name: '1 aggregate request/sec during ingest',
      pass: aggOk >= Math.max(1, Math.floor(ingestMs / cfg.aggregateIntervalMs) - 2),
      detail: `ok ${fmtNum(aggOk)}  over ${(ingestMs / 1000).toFixed(1)}s`,
    },
  ];

  printReport({
    cfg,
    ingestMs,
    totalBatches,
    failBatches,
    accepted,
    rejected,
    sustained,
    ingest: ingestStats,
    agg: aggStats,
    query: queryStats,
    statusCounts,
    checks,
  });

  if (checks.some((check) => !check.pass)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
