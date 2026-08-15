export type HttpResult<T> = {
  ok: boolean;
  status: number;
  ms: number;
  body: T | null;
  error?: string;
};

async function request<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<HttpResult<T>> {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = performance.now() - started;
    let body: T | null = null;
    try {
      body = (await res.json()) as T;
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, ms, body };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      ms: performance.now() - started,
      body: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function postLogs(
  baseUrl: string,
  logs: unknown[],
  timeoutMs = 30_000,
): Promise<HttpResult<{ accepted: number; rejected: unknown[] }>> {
  return request(`${baseUrl}/logs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ logs }),
  }, timeoutMs);
}

export function getHealth(
  baseUrl: string,
  timeoutMs = 5_000,
): Promise<HttpResult<unknown>> {
  return request(`${baseUrl}/health`, { method: 'GET' }, timeoutMs);
}

export function getLogs(
  baseUrl: string,
  query: URLSearchParams,
  timeoutMs = 15_000,
): Promise<HttpResult<{ logs: unknown[]; next_cursor: string | null }>> {
  return request(`${baseUrl}/logs?${query}`, { method: 'GET' }, timeoutMs);
}

export function getAggregate(
  baseUrl: string,
  query: URLSearchParams,
  timeoutMs = 15_000,
): Promise<HttpResult<{ buckets: unknown[] }>> {
  return request(
    `${baseUrl}/logs/aggregate?${query}`,
    { method: 'GET' },
    timeoutMs,
  );
}
