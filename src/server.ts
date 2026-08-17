import { endPools } from './DB/client.js';
import { applyRetentionPolicy } from './DB/config/retention.js';
import { ingestBuffer } from './services/ingest-buffer.js';
import { buildApp } from './app.js';
import { config } from './config.js';

async function start(): Promise<void> {
  await applyRetentionPolicy(config.retentionDays);

  if (config.ingestBufferEnabled) {
    ingestBuffer.start();
  }

  const app = buildApp();
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`listening on :${config.port} (${config.nodeEnv})`);
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 0;

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

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void start().catch((err) => {
  console.error('failed to start server:', err);
  process.exit(1);
});
