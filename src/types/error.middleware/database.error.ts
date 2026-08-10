import { AppError } from './app.error.js';

/** Postgres / data-store failures → 500 */
export class DatabaseError extends AppError {
  constructor(message = 'database error') {
    super(500, message);
    this.name = 'DatabaseError';
  }
}
