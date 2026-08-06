import type { FastifyInstance } from 'fastify';
import { aggregateHandler } from '../handlers/logs/aggregate.handler.js';

export async function logsAggregateRoute(app: FastifyInstance): Promise<void> {
  app.get('/logs/aggregate', aggregateHandler);
}
