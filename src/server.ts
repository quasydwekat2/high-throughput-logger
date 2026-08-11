import { buildApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./DB/client.js";
import { ingestBuffer } from "./services/ingest-buffer.js";

async function start(): Promise<void> {
  if (config.ingestBufferEnabled) {
    ingestBuffer.start();
  }

  const app = buildApp();
  const server = app.listen(config.port, () => {
    console.log(`listening on :${config.port} (${config.nodeEnv})`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down…`);
    server.close(() => {
      void (async () => {
        if (config.ingestBufferEnabled) {
          await ingestBuffer.stop();
        }
        await pool.end();
        process.exit(0);
      })();
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((err) => {
  console.error("failed to start server:", err);
  process.exit(1);
});
