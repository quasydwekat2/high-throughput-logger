import type { Cursor } from '../types/log.types.js';

export function encodeCursor(ts: string, id: string): string {
  return Buffer.from(JSON.stringify({ ts, id })).toString('base64url');
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));

    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !('ts' in parsed) ||
      !('id' in parsed) ||
      typeof (parsed as Record<string, unknown>).ts !== 'string' ||
      typeof (parsed as Record<string, unknown>).id !== 'string'
    ) {
      return null;
    }

    const { ts, id } = parsed as { ts: string; id: string };
    if (isNaN(Date.parse(ts)) || isNaN(Number(id))) return null;

    return { ts, id };
  } catch {
    return null;
  }
}
