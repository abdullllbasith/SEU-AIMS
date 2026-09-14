import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

export function createAuthRateLimiter({ config, redis, logger }) {
  const options = {
    windowMs: config.auth.loginWindowMs,
    max: config.auth.loginMaxAttempts,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts' } },
  };

  if (redis) {
    options.store = new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: 'rl:auth:',
    });
  } else {
    logger?.warn('Auth rate limiter is process-local because Redis is not connected');
  }

  return rateLimit(options);
}
