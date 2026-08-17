import express from 'express';
import type { Express } from 'express';
import {
  healthRoute,
  logsIngestRoute,
  logsQueryRoute,
  logsAggregateRoute,
} from './routes/index.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/index.js';

/** Builds the Express app (middleware + routes). Does not listen. */
export function buildApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);

  healthRoute(app);
  logsIngestRoute(app);
  logsQueryRoute(app);
  logsAggregateRoute(app);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
