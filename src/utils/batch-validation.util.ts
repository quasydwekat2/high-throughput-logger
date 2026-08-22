import type {
  AttributeValue,
  IngestionError,
  LogEntry,
} from '../types/log.types.js';
import { VALID_LEVELS } from '../types/log.types.js';

const MAX_FUTURE_MS = 5 * 60 * 1000;

/**
 * ISO-8601 with timezone. Fast-path the load-gen / Date.toISOString()
 * shape (YYYY-MM-DDTHH:MM:SS.sssZ) before the general regex.
 */
const ISO_8601_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export interface ValidationResult {
  accepted: LogEntry[];
  rejected: IngestionError[];
}

function isIso8601ZMillis(ts: string): boolean {
  // 2026-08-20T14:32:01.123Z — 24 chars, punctuation at fixed offsets.
  if (ts.length !== 24 || ts.charCodeAt(23) !== 90) return false;
  return (
    ts.charCodeAt(4) === 45 &&
    ts.charCodeAt(7) === 45 &&
    ts.charCodeAt(10) === 84 &&
    ts.charCodeAt(13) === 58 &&
    ts.charCodeAt(16) === 58 &&
    ts.charCodeAt(19) === 46
  );
}

function isAttributeValue(value: unknown): value is AttributeValue {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function validateAttributes(attributes: unknown): string | null {
  if (attributes === undefined || attributes === null) return null;

  if (typeof attributes !== 'object' || Array.isArray(attributes)) {
    return 'attributes must be a flat object';
  }

  for (const key in attributes as Record<string, unknown>) {
    const v = (attributes as Record<string, unknown>)[key];
    if (!isAttributeValue(v)) {
      return 'attributes values must be strings, numbers, or booleans (no nested objects or arrays)';
    }
  }

  return null;
}

export function validateLogBatch(logs: unknown[]): ValidationResult {
  const accepted: LogEntry[] = new Array<LogEntry>(logs.length);
  let acceptedN = 0;
  const rejected: IngestionError[] = [];
  const now = Date.now();
  const ceiling = now + MAX_FUTURE_MS;

  for (let i = 0; i < logs.length; i++) {
    const entry = logs[i];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      rejected.push({
        index: i,
        reason: 'timestamp must be a valid ISO 8601 string',
      });
      continue;
    }
    const log = entry as Record<string, unknown>;

    const ts = log.timestamp;
    if (typeof ts !== 'string') {
      rejected.push({
        index: i,
        reason: 'timestamp must be a valid ISO 8601 string',
      });
      continue;
    }

    const fastIso = isIso8601ZMillis(ts);
    if (!fastIso && !ISO_8601_RE.test(ts)) {
      rejected.push({
        index: i,
        reason: 'timestamp must be a valid ISO 8601 string',
      });
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

    if (typeof log.level !== 'string' || !VALID_LEVELS.has(log.level)) {
      rejected.push({
        index: i,
        reason: 'level must be one of: debug, info, warn, error',
      });
      continue;
    }

    if (typeof log.service !== 'string' || log.service.length === 0) {
      rejected.push({ index: i, reason: 'service must be a non-empty string' });
      continue;
    }

    if (typeof log.message !== 'string' || log.message.length === 0) {
      rejected.push({ index: i, reason: 'message must be a non-empty string' });
      continue;
    }

    if ('attributes' in log) {
      const attrError = validateAttributes(log.attributes);
      if (attrError !== null) {
        rejected.push({ index: i, reason: attrError });
        continue;
      }
    }

    accepted[acceptedN++] = log as unknown as LogEntry;
  }

  accepted.length = acceptedN;
  return { accepted, rejected };
}
