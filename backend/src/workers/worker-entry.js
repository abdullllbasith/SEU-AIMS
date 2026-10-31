import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/index.js';
import { assertProductionConfig } from '../config/validate-production.js';
import { createLogger } from '../infrastructure/logging/logger.js';
import { createInfrastructure } from '../infrastructure/create-infrastructure.js';
import { JOB_NAMES } from '../infrastructure/queue/job-names.js';
import { registerJobProcessors } from './processors/index.js';
import { processQueuedJobs } from './dispatch.js';
import { releaseDueNotifications } from '../modules/notifications/index.js';
import '../modules/ca-recovery/index.js';
import { disconnectMongo } from '../infrastructure/database/mongo.js';
import { disconnectRedis } from '../infrastructure/redis/client.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Worker process. Jobs must call domain services — they do not own business rules.
 */
export async function startWorker() {
  const config = loadConfig();
  assertProductionConfig(config);
  const logger = createLogger({ service: 'seu-aims-worker', level: config.logLevel });
  const infrastructure = await createInfrastructure({
    config,
    logger,
    backendRoot,
    connect: true,
  });

  const processors = registerJobProcessors({ logger, infrastructure });
  let running = true;

  logger.info('Worker ready', { jobs: Object.values(JOB_NAMES) });

  const drainLoop = (async () => {
    while (running) {
      try {
        await processQueuedJobs(infrastructure.queue, processors, { limit: 25 });
      } catch (error) {
        logger.error('Worker drain failed', { message: error.message });
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  })();

  // Releases due reminders and recovers stuck deliveries. Idempotent and safe with several workers.
  const sweepIntervalMs = Math.max(1000, Number(config.notifications?.sweepIntervalMs) || 30_000);
  const sweepLoop = (async () => {
    while (running) {
      try {
        const summary = await releaseDueNotifications({ infrastructure });
        if (summary.released || summary.cancelled || summary.retried || summary.recovered || summary.requeued) {
          logger.info('Notification sweep', summary);
        }
      } catch (error) {
        logger.error('Notification sweep failed', { message: error.message });
      }
      const until = Date.now() + sweepIntervalMs;
      while (running && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  })();

  async function shutdown() {
    running = false;
    await drainLoop.catch(() => {});
    await sweepLoop.catch(() => {});
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
