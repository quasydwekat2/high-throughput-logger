import type { FastifyInstance } from 'fastify';
import { ingestHandler } from '../handlers/logs/ingest.handler.js';

export async function logsIngestRoute(app: FastifyInstance): Promise<void> {
  app.post('/logs', ingestHandler);
}
