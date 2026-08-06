import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { healthRoutes, logsRoutes } from './routes/index.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(healthRoutes);
  app.register(logsRoutes);

  return app;
}
