import express from "express";
import type { Express } from "express";
import cors from "cors";
import {
  healthRoute,
  logsIngestRoute,
  logsQueryRoute,
  logsAggregateRoute,
} from "./routes/index.js";
import { errorMiddleware, notFoundMiddleware } from "./middleware/index.js";

/** Builds the Express app (middleware + routes). Does not listen. */
export function buildApp(): Express {
  const app = express();

  app.use(cors());
  // Default 100kb is too small for high-throughput batches (~500 logs ≈ 100kb+).
  app.use(express.json({ limit: "2mb" }));

  healthRoute(app);
  logsIngestRoute(app);
  logsQueryRoute(app);
  logsAggregateRoute(app);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
