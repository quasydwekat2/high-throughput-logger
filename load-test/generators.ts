import { loadTestConfig } from './config.js';

export interface SyntheticLog {
  timestamp: string;
  level: string;
  service: string;
  message: string;
  attributes: {
    region: string;
    request_id: string;
    user_id: number;
    retries: number;
    marker?: string;
  };
}

const REGIONS = ['us-east', 'eu-west', 'ap-south'] as const;

let seq = 0;

function nextId(): number {
  seq += 1;
  return seq;
}

/** Spread timestamps across ~30 days ending at `now`. */
export function timestampForIndex(index: number, total: number, nowMs: number): string {
  const monthMs = 30 * 24 * 60 * 60 * 1000;
  const offset = total <= 1 ? 0 : Math.floor((index / (total - 1)) * monthMs);
  return new Date(nowMs - monthMs + offset).toISOString();
}

export function makeLog(
  index: number,
  total: number,
  nowMs: number,
  marker?: string,
): SyntheticLog {
  const id = nextId();
  const services = loadTestConfig.services;
  const levels = loadTestConfig.levels;

  const log: SyntheticLog = {
    timestamp: timestampForIndex(index, total, nowMs),
    level: levels[id % levels.length]!,
    service: services[id % services.length]!,
    // Keep messages compact so batches stay under typical body limits.
    message: `lt ${id}`,
    attributes: {
      region: REGIONS[id % REGIONS.length]!,
      request_id: `r${id.toString(36)}`,
      user_id: (id % 10_000) + 1,
      retries: id % 5,
    },
  };

  if (marker !== undefined) {
    log.attributes.marker = marker;
    log.message = `loadtest marker ${marker}`;
    // Fresh timestamp so visibility probe is recent
    log.timestamp = new Date().toISOString();
  }

  return log;
}

export function makeBatch(
  startIndex: number,
  count: number,
  total: number,
  nowMs: number,
  marker?: string,
): SyntheticLog[] {
  const batch: SyntheticLog[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const idx = startIndex + i;
    batch[i] =
      marker !== undefined && i === 0
        ? makeLog(idx, total, nowMs, marker)
        : makeLog(idx, total, nowMs);
  }
  return batch;
}

export function uniqueMarker(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
