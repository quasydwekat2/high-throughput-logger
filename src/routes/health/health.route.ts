import type { FastifyInstance } from 'fastify';
import { healthHandler } from './health.handler.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', healthHandler);
}
