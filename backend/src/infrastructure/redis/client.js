import Redis from 'ioredis';

let client;

export function createRedisClient({ url, logger }) {
  if (!url) {
    logger?.warn('Redis URL is not configured; Redis remains disconnected');
    return null;
  }

  if (!client) {
    client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: null });
    client.on('error', (error) => {
      logger?.error('Redis client error', { message: error.message });
    });
  }

  return client;
}

export async function connectRedis(redis, { logger } = {}) {
  if (!redis) {
    return null;
  }

  if (redis.status === 'wait' || redis.status === 'end') {
    await redis.connect();
  }

  logger?.info('Redis connected');
  return redis;
}

export async function disconnectRedis(redis, { logger } = {}) {
  if (!redis) {
    return;
  }

  await redis.quit();
  client = undefined;
  logger?.info('Redis disconnected');
}
