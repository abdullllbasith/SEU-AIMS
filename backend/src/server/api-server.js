import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/index.js';
import { assertProductionConfig } from '../config/validate-production.js';
import { createLogger } from '../infrastructure/logging/logger.js';
import { createInfrastructure } from '../infrastructure/create-infrastructure.js';
import { createApp } from '../app/create-app.js';
import { createRealtimeServer } from '../infrastructure/realtime/socket-server.js';
import { attachStudyRoomRealtime } from '../modules/study-room/index.js';
import { disconnectMongo } from '../infrastructure/database/mongo.js';
import { disconnectRedis } from '../infrastructure/redis/client.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function startApiServer() {
  const config = loadConfig();
  assertProductionConfig(config);
  if (!config.auth.jwtSecret) {
    throw new Error('AUTH_JWT_SECRET must be set in the environment');
  }
  const logger = createLogger({ service: 'seu-aims-api', level: config.logLevel });
  const infrastructure = await createInfrastructure({
    config,
    logger,
    backendRoot,
    connect: true,
  });

  const app = createApp({ config, logger, infrastructure });
  const server = http.createServer(app);
  const io = await createRealtimeServer(server, {
    corsOrigin: config.api.corsOrigin,
    redis: infrastructure.redis,
    logger,
  });
  attachStudyRoomRealtime(io, { config, logger, infrastructure });
  app.set('io', io);

  await new Promise((resolve) => {
    server.listen(config.api.port, config.api.host, resolve);
  });

  logger.info('API server listening', { host: config.api.host, port: config.api.port });

  async function shutdown() {
    logger.info('API server shutting down');
    io.close();
    if (io.redisSubClient && typeof io.redisSubClient.quit === 'function') {
      await io.redisSubClient.quit().catch(() => {});
    }
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
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

  return { server, shutdown };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  startApiServer().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}
