import type { Express } from 'express';
import express from 'express';
import { ingestHandler } from '../handlers/logs/ingest.handler.js';

export function logsIngestRoute(app: Express): void {
  app.post('/logs', express.json({ limit: '2mb' }), ingestHandler);
}
