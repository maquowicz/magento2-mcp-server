import { loadEnv } from './env-loader.js';

try {
  loadEnv();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[ENV] ${message}\n`);
  process.exit(1);
}
