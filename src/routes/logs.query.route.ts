import type { Express } from "express";
import { queryHandler } from "../handlers/logs/query.handler.js";

export function logsQueryRoute(app: Express): void {
  app.get("/logs", queryHandler);
}
