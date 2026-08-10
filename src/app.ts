import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import {
  healthRoute,
  logsIngestRoute,
  logsQueryRoute,
  logsAggregateRoute,
} from './routes/index.js';

export function buildApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  healthRoute(app);
  logsIngestRoute(app);
  logsQueryRoute(app);
  logsAggregateRoute(app);

  return app;
}
