import { AppError } from './app.error.js';

/** Missing/invalid credentials → 401 (for optional auth later) */
export class AuthenticationError extends AppError {
  constructor(message = 'unauthorized') {
    super(401, message);
    this.name = 'AuthenticationError';
  }
}
