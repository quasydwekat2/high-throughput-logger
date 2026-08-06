import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import {
  healthRoute,
  logsIngestRoute,
  logsQueryRoute,
  logsAggregateRoute,
} from './routes/index.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(healthRoute);
  app.register(logsIngestRoute);
  app.register(logsQueryRoute);
  app.register(logsAggregateRoute);

  return app;
}
