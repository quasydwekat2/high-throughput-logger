import type { IngestionError, LogEntry } from '../types/log.types.js';
import { VALID_LEVELS } from '../types/log.types.js';

const MAX_FUTURE_MS = 5 * 60 * 1000;

// Matches ISO 8601 with timezone: 2024-01-01T00:00:00Z or 2024-01-01T00:00:00.000+03:00
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export interface ValidationResult {
  accepted: LogEntry[];
  rejected: IngestionError[];
}

function validateAttributes(attributes: unknown): string | null {
  if (attributes === undefined || attributes === null) return null;

  if (typeof attributes !== 'object' || Array.isArray(attributes)) {
    return 'attributes must be a flat object';
  }

  const entries = Object.values(attributes as Record<string, unknown>);
  for (let i = 0; i < entries.length; i++) {
    const v = entries[i];
    const t = typeof v;
    if (t === 'object' || t === 'function' || t === 'symbol' || t === 'undefined') {
      return 'attributes values must be strings, numbers, or booleans (no nested objects or arrays)';
    }
  }

  return null;
}

export function validateLogBatch(logs: unknown[]): ValidationResult {
  const accepted: LogEntry[] = [];
  const rejected: IngestionError[] = [];
  const now = Date.now();
  const ceiling = now + MAX_FUTURE_MS;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i] as Record<string, unknown>;

    // --- timestamp ---
    const ts = log.timestamp;
    if (typeof ts !== 'string' || !ISO_8601_RE.test(ts)) {
      rejected.push({ index: i, reason: 'timestamp must be a valid ISO 8601 string' });
      continue;
    }
    const tsMs = Date.parse(ts);
    if (Number.isNaN(tsMs)) {
      rejected.push({ index: i, reason: 'timestamp is not a parseable date' });
      continue;
    }
    if (tsMs > ceiling) {
      rejected.push({
        index: i,
        reason: 'timestamp must not be more than 5 minutes in the future',
      });
      continue;
    }

    // --- level ---
    if (typeof log.level !== 'string' || !VALID_LEVELS.has(log.level)) {
      rejected.push({ index: i, reason: 'level must be one of: debug, info, warn, error' });
      continue;
    }

    // --- service ---
    if (typeof log.service !== 'string' || log.service.length === 0) {
      rejected.push({ index: i, reason: 'service must be a non-empty string' });
      continue;
    }

    // --- message ---
    if (typeof log.message !== 'string' || log.message.length === 0) {
      rejected.push({ index: i, reason: 'message must be a non-empty string' });
      continue;
    }

    // --- attributes (optional) ---
    if ('attributes' in log) {
      const attrError = validateAttributes(log.attributes);
      if (attrError !== null) {
        rejected.push({ index: i, reason: attrError });
        continue;
      }
    }

    accepted.push({
      timestamp: ts,
      level: log.level as LogEntry['level'],
      service: log.service,
      message: log.message,
      ...(log.attributes !== undefined
        ? { attributes: log.attributes as LogEntry['attributes'] }
        : {}),
    });
  }

  return { accepted, rejected };
}
