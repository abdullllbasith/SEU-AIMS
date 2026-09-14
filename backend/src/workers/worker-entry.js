import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/index.js';
import { createLogger } from '../infrastructure/logging/logger.js';
import { createInfrastructure } from '../infrastructure/create-infrastructure.js';
import { JOB_NAMES } from '../infrastructure/queue/job-names.js';
import { registerJobProcessors } from './processors/index.js';
import { disconnectMongo } from '../infrastructure/database/mongo.js';
import { disconnectRedis } from '../infrastructure/redis/client.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Worker process. Jobs must call domain services — they do not own business rules.
 */
export async function startWorker() {
  const config = loadConfig();
  const logger = createLogger({ service: 'seu-aims-worker', level: config.logLevel });
  const infrastructure = await createInfrastructure({
    config,
    logger,
    backendRoot,
    connect: true,
  });

  const processors = registerJobProcessors({ logger, infrastructure });

  logger.info('Worker ready', { jobs: Object.values(JOB_NAMES) });

  async function shutdown() {
    logger.info('Worker shutting down');
    await infrastructure.queue.close();
    await disconnectRedis(infrastructure.redis, { logger });
    await disconnectMongo({ logger });
  }

  process.once('SIGINT', () => {
    shutdown().finally(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    shutdown().finally(() => process.exit(0));
  });

  return { processors, shutdown };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  startWorker().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}
