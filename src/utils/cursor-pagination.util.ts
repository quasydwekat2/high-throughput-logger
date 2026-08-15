import type { CursorPayload } from '../types/log.types.js';

/** `timestamp` must be ISO-8601 with microseconds (not Date.toISOString()). */
export function encodeCursor(timestamp: string, id: string): string {
  return Buffer.from(JSON.stringify({ timestamp, id })).toString('base64url');
}

export function decodeCursor(raw: string): CursorPayload | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    );

    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !('timestamp' in parsed) ||
      !('id' in parsed) ||
      typeof (parsed as Record<string, unknown>).timestamp !== 'string' ||
      typeof (parsed as Record<string, unknown>).id !== 'string'
    ) {
      return null;
    }

    const { timestamp, id } = parsed as CursorPayload;
    if (isNaN(Date.parse(timestamp)) || isNaN(Number(id))) return null;

    return { timestamp, id };
  } catch {
    return null;
  }
}
