import { AppError } from './app.error.js';
import type { HealthStatusResponse } from '../http/health.types.js';

/** Service not ready (DB down / migrations incomplete) → 503 */
export class ServiceUnavailableError extends AppError {
  constructor() {
    const body: HealthStatusResponse = { status: 'unavailable' };
    super(503, 'unavailable', body);
    this.name = 'ServiceUnavailableError';
  }
}
