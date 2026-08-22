import http from "node:http";
import { endPools } from "./DB/client.js";
import { applyRetentionPolicy } from "./DB/config/retention.js";
import { ingestBuffer } from "./services/ingest-buffer.js";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import {
  handleIngestHttp,
  isIngestUrl,
} from "./handlers/logs/ingest.handler.js";

async function start(): Promise<void> {
  await applyRetentionPolicy(config.retentionDays);

  if (config.ingestBufferEnabled) {
    ingestBuffer.start();
  }

  const app = buildApp();
  const server = http.createServer((req, res) => {
    if (isIngestUrl(req.url) && req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers":
          "Content-Type, Authorization, X-API-Key",
      });
      res.end();
      return;
    }
    if (req.method === "POST" && isIngestUrl(req.url)) {
      void handleIngestHttp(req, res);
      return;
    }
    app(req, res);
  });

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 0;
  server.on("connection", (socket) => {
    socket.setNoDelay(true);
  });

  server.listen(config.port, "0.0.0.0", () => {
    console.log(`listening on :${config.port} (${config.nodeEnv})`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down…`);
    server.close(() => {
      void (async () => {
        if (config.ingestBufferEnabled) {
          await ingestBuffer.stop();
        }
        await endPools();
        process.exit(0);
      })();
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void start().catch((err) => {
  console.error("failed to start server:", err);
  process.exit(1);
});
