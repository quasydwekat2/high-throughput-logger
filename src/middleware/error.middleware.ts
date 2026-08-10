import type { ErrorRequestHandler } from 'express';
import { DatabaseError as PgDatabaseError } from 'pg';
import {
  AppError,
  DatabaseError,
  type ErrorResponse,
} from '../types/app-error.js';

function isMalformedJsonError(err: unknown): boolean {
  if (!(err instanceof SyntaxError)) return false;
  const e = err as SyntaxError & { status?: number; type?: string };
  return e.status === 400 || e.type === 'entity.parse.failed' || 'body' in e;
}

function isPayloadTooLargeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const e = err as Error & { type?: string; status?: number };
  return (
    e.type === 'entity.too.large' ||
    e.status === 413 ||
    e.name === 'PayloadTooLargeError'
  );
}

function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;

  if (isMalformedJsonError(err)) {
    return new AppError(400, 'malformed JSON body');
  }

  if (isPayloadTooLargeError(err)) {
    return new AppError(413, 'request body too large');
  }

  if (err instanceof PgDatabaseError) {
    return new DatabaseError();
  }

  return null;
}

/**
 * Central HTTP error mapper for all routes/handlers.
 *
 * | Kind                    | Status |
 * |-------------------------|--------|
 * | Malformed JSON          | 400    |
 * | ValidationError         | 400    |
 * | IngestRejectedError     | 400    |
 * | AuthenticationError     | 401    |
 * | NotFoundError           | 404    |
 * | Payload too large       | 413    |
 * | DatabaseError / pg      | 500    |
 * | ServiceUnavailableError | 503    |
 * | Unexpected              | 500    |
 */
export const errorMiddleware: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const mapped = toAppError(err);

  if (mapped) {
    if (mapped.statusCode >= 500) {
      console.error('server error:', err);
    }
    const body =
      mapped.responseBody ?? ({ error: mapped.message } satisfies ErrorResponse);
    res.status(mapped.statusCode).json(body);
    return;
  }

  console.error('unhandled error:', err);
  const body: ErrorResponse = { error: 'internal server error' };
  res.status(500).json(body);
};
