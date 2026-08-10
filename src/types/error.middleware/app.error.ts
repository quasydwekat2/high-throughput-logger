/**
 * AppError — superclass for errors handled by `error.middleware`.
 *
 * Naming convention:
 * - File:   `*.error.ts` under `types/errors/`
 * - Class:  PascalCase noun + `Error` (e.g. `ValidationError`)
 * - Throw from handlers / services / utils; never `res.status(...).json(...)` for failures
 * - Middleware turns `statusCode` + `message` / `responseBody` into the HTTP JSON body
 *
 * Prefer a fixed-status subclass over `new AppError(code, …)` when the status is known.
 *
 * Hierarchy:
 *   Error
 *   └── AppError                         (this file — base / superclass)
 *       ├── ValidationError              → 400
 *       ├── IngestRejectedError          → 400 (+ `{ accepted, rejected }`)
 *       ├── AuthenticationError          → 401
 *       ├── NotFoundError                → 404
 *       ├── DatabaseError                → 500
 *       └── ServiceUnavailableError      → 503 (+ `{ status: "unavailable" }`)
 */
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
