/**
 * Required-contract smoke (AUTH_ENABLED=false).
 * Hits GET /health, POST /logs, GET /logs, GET /logs/aggregate with no credentials.
 * An unrecognised Authorization header must be ignored, not rejected.
 */
const BASE = (process.env.BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const HEALTH_TIMEOUT_MS = Number(process.env.HEALTH_TIMEOUT_MS ?? 180_000);

let failed = 0;

function ok(name: string): void {
  console.log(`  ok  ${name}`);
}

function fail(name: string, detail: string): void {
  failed += 1;
  console.error(`  FAIL  ${name}: ${detail}`);
}

function assert(name: string, cond: boolean, detail = ''): void {
  if (cond) ok(name);
  else fail(name, detail);
}

async function waitHealthy(): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`GET /health did not return 200 within ${HEALTH_TIMEOUT_MS}ms`);
}

type Json = Record<string, unknown>;

async function req(
  method: string,
  path: string,
  opts: { body?: unknown; raw?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; json: Json | null; text: string }> {
  const headers: Record<string, string> = { ...opts.headers };
  let body: string | undefined;
  if (opts.raw !== undefined) {
    headers['content-type'] ??= 'application/json';
    body = opts.raw;
  } else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body });
  const text = await res.text();
  let parsed: Json | null = null;
  try {
    parsed = JSON.parse(text) as Json;
  } catch {
    parsed = null;
  }
  return { status: res.status, json: parsed, text };
}

function iso(ms = Date.now()): string {
  return new Date(ms).toISOString();
}

async function main(): Promise<void> {
  console.log(`contract smoke → ${BASE} (no credentials)\n`);
  await waitHealthy();

  // ── GET /health ──────────────────────────────────────────────────────────
  {
    const r = await req('GET', '/health');
    assert('GET /health → 200', r.status === 200, `status=${r.status} body=${r.text}`);
  }
  {
    const r = await req('GET', '/health', {
      headers: { authorization: 'Bearer ignored-when-auth-off' },
    });
    assert(
      'GET /health ignores Authorization',
      r.status === 200,
      `status=${r.status}`,
    );
  }

  const marker = `ci-${Date.now()}`;
  const ts = iso();
  const since = iso(Date.now() - 60_000);
  const until = iso(Date.now() + 60_000);

  // ── POST /logs ───────────────────────────────────────────────────────────
  {
    const r = await req('POST', '/logs', {
      body: {
        logs: [
          {
            timestamp: ts,
            level: 'error',
            service: 'checkout',
            message: `payment declined ${marker}`,
            attributes: { user_id: '42', retries: 3, region: 'eu-west' },
          },
        ],
      },
    });
    assert('POST /logs valid → 200', r.status === 200, `status=${r.status} ${r.text}`);
    assert(
      'POST /logs accepted=1',
      r.json?.accepted === 1,
      `accepted=${String(r.json?.accepted)}`,
    );
    assert('POST /logs rejected is array', Array.isArray(r.json?.rejected));
  }

  {
    const r = await req(
      'POST',
      '/logs',
      {
        body: {
          logs: [
            {
              timestamp: ts,
              level: 'info',
              service: 'auth',
              message: `ok ${marker}`,
            },
            {
              timestamp: ts,
              level: 'critical',
              service: 'auth',
              message: 'bad',
            },
          ],
        },
        headers: { authorization: 'Bearer ignored-when-auth-off' },
      },
    );
    assert(
      'POST /logs mixed + ignored Bearer → 200',
      r.status === 200,
      `status=${r.status} ${r.text}`,
    );
    assert('POST /logs mixed accepted=1', r.json?.accepted === 1, r.text);
    const rejected = r.json?.rejected as { index: number; reason: string }[] | undefined;
    assert(
      'POST /logs mixed rejected index 1',
      Array.isArray(rejected) && rejected[0]?.index === 1,
      r.text,
    );
  }

  {
    const r = await req('POST', '/logs', {
      body: {
        logs: [{ timestamp: ts, level: 'fatal', service: 'x', message: 'nope' }],
      },
    });
    assert('POST /logs all rejected → 400', r.status === 400, `status=${r.status}`);
    assert('POST /logs all rejected accepted=0', r.json?.accepted === 0, r.text);
    assert('POST /logs all rejected has rejected[]', Array.isArray(r.json?.rejected));
  }

  {
    const r = await req('POST', '/logs', { body: { nope: true } });
    assert('POST /logs bad shape → 400', r.status === 400, `status=${r.status}`);
    assert(
      'POST /logs bad shape {error}',
      typeof r.json?.error === 'string',
      r.text,
    );
  }

  {
    const r = await req('POST', '/logs', { raw: '{not-json' });
    assert('POST /logs malformed JSON → 400', r.status === 400, `status=${r.status}`);
  }

  // ── GET /logs ────────────────────────────────────────────────────────────
  {
    const r = await req('GET', `/logs?service=checkout&q=${encodeURIComponent(marker)}&limit=10`);
    assert('GET /logs → 200', r.status === 200, `status=${r.status} ${r.text}`);
    const logs = r.json?.logs as unknown[] | undefined;
    assert('GET /logs has logs[]', Array.isArray(logs), r.text);
    assert(
      'GET /logs next_cursor is string or null',
      r.json !== null && ('next_cursor' in r.json) &&
        (r.json.next_cursor === null || typeof r.json.next_cursor === 'string'),
      r.text,
    );
    assert(
      'GET /logs found ingested row',
      Array.isArray(logs) && logs.length >= 1,
      r.text,
    );
  }

  {
    const r = await req('GET', '/logs?attr.user_id=42&limit=5');
    assert('GET /logs attr.user_id → 200', r.status === 200, `status=${r.status}`);
  }

  {
    const r = await req('GET', '/logs?level=nope');
    assert('GET /logs bad level → 400', r.status === 400, `status=${r.status}`);
    assert('GET /logs bad level {error}', typeof r.json?.error === 'string', r.text);
  }

  {
    const r = await req('GET', '/logs?cursor=not-a-cursor');
    assert('GET /logs bad cursor → 400', r.status === 400, `status=${r.status}`);
  }

  {
    const r = await req('GET', `/logs?since=${encodeURIComponent(until)}&until=${encodeURIComponent(since)}`);
    assert('GET /logs until < since → 400', r.status === 400, `status=${r.status}`);
  }

  {
    const r = await req('GET', '/logs?limit=10', {
      headers: { authorization: 'Bearer ignored-when-auth-off' },
    });
    assert('GET /logs ignores Authorization', r.status === 200, `status=${r.status}`);
  }

  // ── GET /logs/aggregate ──────────────────────────────────────────────────
  {
    const qs = new URLSearchParams({
      since,
      until,
      bucket: '1m',
      group_by: 'service',
      q: marker,
    });
    const r = await req('GET', `/logs/aggregate?${qs.toString()}`);
    assert('GET /logs/aggregate → 200', r.status === 200, `status=${r.status} ${r.text}`);
    const buckets = r.json?.buckets as unknown[] | undefined;
    assert('GET /logs/aggregate has buckets[]', Array.isArray(buckets), r.text);
  }

  {
    const r = await req('GET', '/logs/aggregate?until=2026-01-01T00:00:00Z&bucket=1h');
    assert('GET /logs/aggregate missing since → 400', r.status === 400, `status=${r.status}`);
    assert('GET /logs/aggregate 400 {error}', typeof r.json?.error === 'string', r.text);
  }

  {
    const qs = new URLSearchParams({ since, until, bucket: '1h' });
    const r = await req('GET', `/logs/aggregate?${qs.toString()}`, {
      headers: { authorization: 'Bearer ignored-when-auth-off' },
    });
    assert(
      'GET /logs/aggregate ignores Authorization',
      r.status === 200,
      `status=${r.status}`,
    );
  }

  console.log('');
  if (failed > 0) {
    console.error(`${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('all contract checks passed');
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
