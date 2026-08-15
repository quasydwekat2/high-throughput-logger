const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
const SERVICES = ['checkout', 'auth', 'billing', 'api', 'worker'] as const;
const REGIONS = ['eu-west', 'us-east', 'ap-south'] as const;
const MESSAGES = [
  'payment declined',
  'request completed',
  'retry scheduled',
  'cache miss',
  'user login',
  'inventory updated',
];

export type GeneratedLog = {
  timestamp: string;
  level: (typeof LEVELS)[number];
  service: (typeof SERVICES)[number];
  message: string;
  attributes: {
    user_id: string;
    region: string;
    retries: number;
    loadtest_id?: string;
  };
};

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function pick<T>(xs: readonly T[], i: number): T {
  return xs[i % xs.length]!;
}

/** Spread timestamps over ~30 days so the dataset matches the brief. */
export function makeBatch(
  count: number,
  batchIndex: number,
  nowMs: number,
  markerId?: string,
): GeneratedLog[] {
  const logs: GeneratedLog[] = [];
  for (let i = 0; i < count; i++) {
    const seq = batchIndex * 10_000 + i;
    const offset = (seq * 9973) % MONTH_MS;
    const ts = new Date(nowMs - offset).toISOString();
    logs.push({
      timestamp: ts,
      level: pick(LEVELS, seq),
      service: pick(SERVICES, seq >> 1),
      message: pick(MESSAGES, seq >> 2),
      attributes: {
        user_id: String(seq % 10_000),
        region: pick(REGIONS, seq),
        retries: seq % 5,
      },
    });
  }
  if (markerId !== undefined && logs[0]) {
    logs[0]!.attributes.loadtest_id = markerId;
  }
  return logs;
}

export function aggregateWindow(nowMs: number): { since: string; until: string } {
  return {
    since: new Date(nowMs - MONTH_MS).toISOString(),
    until: new Date(nowMs + 60_000).toISOString(),
  };
}
