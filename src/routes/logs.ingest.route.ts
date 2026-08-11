import type { Express } from "express";
import { ingestHandler } from "../handlers/logs/ingest.handler.js";

export function logsIngestRoute(app: Express): void {
  app.post("/logs", ingestHandler);
}
