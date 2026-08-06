import type { FastifyInstance } from 'fastify';
import { healthHandler } from '../handlers/health/health.handler.js';

export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', healthHandler);
}
