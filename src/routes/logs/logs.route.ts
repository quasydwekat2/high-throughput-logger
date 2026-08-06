import type { FastifyInstance } from 'fastify';
import { ingestHandler, queryHandler, aggregateHandler } from './logs.handler.js';

export async function logsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/logs', ingestHandler);
  app.get('/logs', queryHandler);
  app.get('/logs/aggregate', aggregateHandler);
}
