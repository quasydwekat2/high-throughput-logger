import { AppError } from './app.error.js';

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
