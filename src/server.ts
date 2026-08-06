import { buildApp } from './app.js';
import { config } from './config.js';

const app = buildApp();

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`Server listening on port ${config.port}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
