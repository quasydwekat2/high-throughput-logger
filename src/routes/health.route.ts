import type { Express } from "express";
import { healthHandler } from "../handlers/health/health.handler.js";

export function healthRoute(app: Express): void {
  app.get("/health", healthHandler);
}
