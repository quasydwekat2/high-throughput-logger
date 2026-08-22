import path from "node:path";
import { existsSync } from "node:fs";
import express from "express";
import type { Express } from "express";
import {
  healthRoute,
  logsIngestRoute,
  logsQueryRoute,
  logsAggregateRoute,
} from "./routes/index.js";
import {
  corsMiddleware,
  errorMiddleware,
  notFoundMiddleware,
} from "./middleware/index.js";

const publicDir = path.resolve(process.cwd(), "public");
const dashboardIndex = path.join(publicDir, "index.html");

/** Builds the Express app (middleware + routes). Does not listen. */
export function buildApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", false);
  app.use(corsMiddleware);

  healthRoute(app);
  logsIngestRoute(app);
  logsQueryRoute(app);
  logsAggregateRoute(app);

  if (existsSync(dashboardIndex)) {
    app.use(express.static(publicDir, { index: false, fallthrough: true }));
    app.get("/", (_req, res) => {
      res.sendFile(dashboardIndex);
    });
  }

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
