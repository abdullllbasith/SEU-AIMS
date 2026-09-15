import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

export function createSharedRateLimiter({
  config,
  redis,
  logger,
  prefix = 'rl:api:',
  windowMs,
  max,
}) {
  const options = {
    windowMs: windowMs || config.api.rateLimitWindowMs,
    max: max || config.api.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts' } },
  };

  if (redis) {
    options.store = new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix,
    });
  } else {
    logger?.warn('HTTP rate limiter is process-local because Redis is not connected');
  }

  return rateLimit(options);
}
