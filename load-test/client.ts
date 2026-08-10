import { loadTestConfig } from './config.js';

export interface IngestResponse {
  accepted: number;
  rejected: Array<{ index: number; reason: string }>;
}

export interface QueryResponse {
  logs: Array<{
    id: string;
    timestamp: string;
    level: string;
    service: string;
    message: string;
    attributes?: Record<string, string | number | boolean>;
  }>;
  next_cursor: string | null;
}

export interface AggregateResponse {
  buckets: Array<{ start: string; group: string | null; count: number }>;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = 'HttpError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: T; latencyMs: number }> {
  const url = `${loadTestConfig.baseUrl}${path}`;
  const started = performance.now();

  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const latencyMs = performance.now() - started;
  const text = await res.text();

  if (!res.ok) {
    throw new HttpError(res.status, text);
  }

  const data = (text ? JSON.parse(text) : {}) as T;
  return { data, latencyMs };
}

export async function waitForHealth(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${loadTestConfig.baseUrl}/health`);
      if (res.status === 200) return;
      lastErr = new Error(`health status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await sleep(500);
  }

  throw new Error(
    `health check timed out after ${timeoutMs}ms: ${String(lastErr)}`,
  );
}

export async function postLogs(
  logs: unknown[],
): Promise<{ accepted: number; rejected: number; latencyMs: number }> {
  const { data, latencyMs } = await request<IngestResponse>('POST', '/logs', {
    logs,
  });
  return {
    accepted: data.accepted,
    rejected: data.rejected?.length ?? 0,
    latencyMs,
  };
}

export async function queryLogs(
  params: Record<string, string>,
): Promise<{ data: QueryResponse; latencyMs: number }> {
  const qs = new URLSearchParams(params).toString();
  return request<QueryResponse>('GET', `/logs?${qs}`);
}

export async function aggregateLogs(
  params: Record<string, string>,
): Promise<{ data: AggregateResponse; latencyMs: number }> {
  const qs = new URLSearchParams(params).toString();
  return request<AggregateResponse>('GET', `/logs/aggregate?${qs}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
