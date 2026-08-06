import type { FastifyInstance } from 'fastify';
import { queryHandler } from '../handlers/logs/query.handler.js';

export async function logsQueryRoute(app: FastifyInstance): Promise<void> {
  app.get('/logs', queryHandler);
}
