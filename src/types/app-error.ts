/** Standard error body: `{ "error": "..." }` */
export interface ErrorResponse {
  error: string;
}

/** GET /health body */
export interface HealthStatusResponse {
  status: 'ok' | 'unavailable';
}

/** Thrown application errors → HTTP status via error middleware. */
export class AppError extends Error {
  readonly statusCode: number;
  /** If set, sent as JSON instead of `{ error: message }`. */
  readonly responseBody?: unknown;

  constructor(statusCode: number, message: string, responseBody?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

/** Malformed input / bad query / bad body shape → 400 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
    this.name = 'ValidationError';
  }
}

/**
 * POST /logs when every entry is rejected → 400
 * Body: `{ accepted, rejected }` (API contract, not ErrorResponse).
 */
export class IngestRejectedError extends AppError {
  constructor(responseBody: unknown) {
    super(400, 'all logs rejected', responseBody);
    this.name = 'IngestRejectedError';
  }
}

/** Missing/invalid credentials → 401 (for optional auth later) */
export class AuthenticationError extends AppError {
  constructor(message = 'unauthorized') {
    super(401, message);
    this.name = 'AuthenticationError';
  }
}

/** Unknown route or resource → 404 */
export class NotFoundError extends AppError {
  constructor(message = 'not found') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

/** Postgres / data-store failures → 500 */
export class DatabaseError extends AppError {
  constructor(message = 'database error') {
    super(500, message);
    this.name = 'DatabaseError';
  }
}

/** Service not ready (DB down / migrations incomplete) → 503 */
export class ServiceUnavailableError extends AppError {
  constructor() {
    const body: HealthStatusResponse = { status: 'unavailable' };
    super(503, 'unavailable', body);
    this.name = 'ServiceUnavailableError';
  }
}
