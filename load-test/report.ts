import type { LoadConfig } from './config.js';
import { fmtMs, fmtNum, fmtRate, type LatencyStats } from './metrics.js';

export type Check = { name: string; pass: boolean; detail: string };

const W = 68;
const useColor =
  process.env.NO_COLOR === undefined &&
  process.env.FORCE_COLOR !== '0' &&
  (process.stdout.isTTY === true || process.env.FORCE_COLOR === '1');

const c = {
  reset: useColor ? '\x1b[0m' : '',
  bold: useColor ? '\x1b[1m' : '',
  dim: useColor ? '\x1b[2m' : '',
  green: useColor ? '\x1b[32m' : '',
  red: useColor ? '\x1b[31m' : '',
  cyan: useColor ? '\x1b[36m' : '',
  yellow: useColor ? '\x1b[33m' : '',
};

function pad(s: string, n: number, align: 'l' | 'r' = 'l'): string {
  const vis = s.replace(/\x1b\[[0-9;]*m/g, '');
  const gap = Math.max(0, n - vis.length);
  return align === 'r' ? ' '.repeat(gap) + s : s + ' '.repeat(gap);
}

function rule(title?: string): string {
  if (!title) return `${c.dim}${'─'.repeat(W)}${c.reset}`;
  const inner = ` ${title} `;
  const left = 2;
  const right = Math.max(1, W - left - inner.length);
  return `${c.dim}${'─'.repeat(left)}${c.reset}${c.bold}${inner}${c.reset}${c.dim}${'─'.repeat(right)}${c.reset}`;
}

function kv(label: string, value: string): string {
  return `  ${c.dim}${pad(label, 14)}${c.reset}${value}`;
}

function phase(label: string): string {
  return `  ${c.dim}${pad(label, 8)}${c.reset}`;
}

function bar(pct: number, width = 22): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return `${c.cyan}${'█'.repeat(filled)}${c.dim}${'░'.repeat(width - filled)}${c.reset}`;
}

export function printBanner(cfg: LoadConfig): void {
  const mode = cfg.smoke ? `${c.yellow}smoke${c.reset}` : `${c.cyan}full${c.reset}`;
  console.log('');
  console.log(rule('load test'));
  console.log(kv('mode', mode));
  console.log(kv('target', cfg.baseUrl));
  console.log(kv('logs', `${fmtNum(cfg.totalLogs)}  @  ${fmtNum(cfg.targetLogsPerSec)}/s`));
  console.log(kv('batch', `${fmtNum(cfg.batchSize)} × ${cfg.concurrency} workers`));
  console.log(kv('warmup', `${cfg.warmupSec}s`));
  console.log(rule());
}

export function beginWait(label: string): void {
  process.stdout.write(phase(label));
}

export function endWait(ok: boolean, detail: string): void {
  const color = ok ? c.green : c.red;
  console.log(`  ${color}${detail}${c.reset}`);
}

export async function waitHealthyPretty(
  check: () => Promise<boolean>,
  timeoutMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  beginWait('health');
  process.stdout.write('waiting');
  while (Date.now() < deadline) {
    if (await check()) {
      endWait(true, 'ready');
      return;
    }
    process.stdout.write('.');
    await sleep(1000);
  }
  endWait(false, 'timeout');
  throw new Error(`GET /health did not return 200 within ${timeoutMs}ms`);
}

export async function warmupPretty(
  seconds: number,
  tick: () => Promise<void>,
): Promise<void> {
  if (seconds <= 0) return;
  const until = Date.now() + seconds * 1000;
  const started = Date.now();
  const tty = process.stdout.isTTY === true;
  while (Date.now() < until) {
    await tick();
    const elapsed = (Date.now() - started) / 1000;
    const pct = Math.min(100, (elapsed / seconds) * 100);
    const line = `${phase('warmup')}${bar(pct)}  ${elapsed.toFixed(0)}/${seconds}s`;
    if (tty) process.stdout.write(`\r${line}   `);
  }
  if (tty) process.stdout.write('\r');
  console.log(`${phase('warmup')}${bar(100)}  ${c.green}done${c.reset}     `);
}

export function startProgress(get: () => {
  done: number;
  total: number;
  accepted: number;
  started: number;
}): () => void {
  const tty = process.stdout.isTTY === true;
  const intervalMs = tty ? 400 : 5_000;

  const render = (): string => {
    const { done, total, accepted, started } = get();
    const elapsed = Math.max(0.001, (Date.now() - started) / 1000);
    const pct = total === 0 ? 100 : (done / total) * 100;
    return (
      `${phase('ingest')}${bar(pct)}  ` +
      `${pad(`${Math.floor(pct)}%`, 4, 'r')}  ` +
      `${fmtNum(done)}/${fmtNum(total)}  ` +
      `${c.cyan}${fmtRate(accepted / elapsed)}${c.reset}`
    );
  };

  const id = setInterval(() => {
    const line = render();
    if (tty) process.stdout.write(`\r${line}          `);
    else console.log(line);
  }, intervalMs);

  return () => {
    clearInterval(id);
    const line = render();
    if (tty) process.stdout.write(`\r${line}          \n`);
    else console.log(line);
  };
}

function latencyRow(name: string, s: LatencyStats, widths: number[]): string {
  const cells = [
    pad(name, widths[0]!),
    pad(fmtMs(s.p50), widths[1]!, 'r'),
    pad(fmtMs(s.p95), widths[2]!, 'r'),
    pad(fmtMs(s.p99), widths[3]!, 'r'),
    pad(fmtMs(s.max), widths[4]!, 'r'),
    pad(fmtNum(s.n), widths[5]!, 'r'),
  ];
  return `  ${cells.join('  ')}`;
}

function printLatencyTable(
  ingest: LatencyStats,
  agg: LatencyStats,
  query: LatencyStats,
): void {
  const headers = ['', 'p50', 'p95', 'p99', 'max', 'n'];
  const rows: [string, LatencyStats][] = [
    ['ingest', ingest],
    ['aggregate', agg],
    ['query', query],
  ];
  const widths = headers.map((h, i) => {
    const cells = [
      h,
      ...rows.map(([name, s]) => {
        if (i === 0) return name;
        if (i === 5) return fmtNum(s.n);
        const key = (['p50', 'p95', 'p99', 'max'] as const)[i - 1]!;
        return fmtMs(s[key]);
      }),
    ];
    return Math.max(i === 0 ? 10 : 8, ...cells.map((x) => x.length));
  });

  const head = headers
    .map((h, i) => pad(h, widths[i]!, i === 0 ? 'l' : 'r'))
    .join('  ');
  console.log(`  ${c.dim}${head}${c.reset}`);
  for (const [name, s] of rows) {
    console.log(latencyRow(name, s, widths));
  }
}

function printStatus(statusCounts: Map<string, number>): void {
  const grouped = new Map<string, string[]>();
  for (const [key, n] of [...statusCounts.entries()].sort()) {
    const [kind, code] = key.split(':');
    const list = grouped.get(kind ?? key) ?? [];
    list.push(`${code ?? '?'} × ${fmtNum(n)}`);
    grouped.set(kind ?? key, list);
  }
  for (const [kind, parts] of grouped) {
    console.log(kv(kind, parts.join('   ')));
  }
}

export function printReport(opts: {
  cfg: LoadConfig;
  ingestMs: number;
  totalBatches: number;
  failBatches: number;
  accepted: number;
  rejected: number;
  sustained: number;
  ingest: LatencyStats;
  agg: LatencyStats;
  query: LatencyStats;
  statusCounts: Map<string, number>;
  checks: Check[];
}): void {
  const {
    cfg, ingestMs, totalBatches, failBatches, accepted, rejected,
    sustained, ingest, agg, query, statusCounts, checks,
  } = opts;
  const passed = checks.filter((x) => x.pass).length;
  const okBatches = totalBatches - failBatches;

  console.log('');
  console.log(rule('results'));
  console.log(kv('duration', `${(ingestMs / 1000).toFixed(1)}s`));
  console.log(kv('batches', `${fmtNum(okBatches)}/${fmtNum(totalBatches)} ok`));
  console.log(kv('accepted', `${fmtNum(accepted)}   ${c.dim}rejected ${fmtNum(rejected)}${c.reset}`));
  console.log(kv('sustained', `${c.bold}${fmtRate(sustained)}${c.reset}   ${c.dim}target ${fmtNum(cfg.targetLogsPerSec)}/s${c.reset}`));
  console.log('');
  printLatencyTable(ingest, agg, query);
  console.log('');
  printStatus(statusCounts);
  console.log(rule('spec checks'));

  const nameW = Math.max(...checks.map((x) => x.name.length));
  for (const check of checks) {
    const badge = check.pass
      ? `${c.green}${c.bold}PASS${c.reset}`
      : `${c.red}${c.bold}FAIL${c.reset}`;
    console.log(`  ${badge}  ${pad(check.name, nameW)}  ${c.dim}${check.detail}${c.reset}`);
  }

  console.log(rule());
  const summary = `${passed}/${checks.length} passed`;
  if (passed === checks.length) {
    console.log(`  ${c.green}${c.bold}${summary}${c.reset}`);
  } else {
    console.log(`  ${c.red}${c.bold}${summary}${c.reset}`);
  }
  console.log('');
}
