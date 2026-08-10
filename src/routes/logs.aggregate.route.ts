import type { Express } from 'express';
import { aggregateHandler } from '../handlers/logs/aggregate.handler.js';

export function logsAggregateRoute(app: Express): void {
  app.get('/logs/aggregate', aggregateHandler);
}
