import helmet from 'helmet';
import cors from 'cors';
import { createSharedRateLimiter } from '../../infrastructure/security/shared-rate-limit.js';

export function applySecurityMiddleware(app, { config, logger, redis } = {}) {
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  const origin = config.api.corsOrigin;
  app.use(
    cors({
      origin: origin === '*' ? false : origin,
      credentials: true,
    }),
  );
  app.use(
    createSharedRateLimiter({
      config,
      redis,
      logger,
      prefix: 'rl:api:',
    }),
  );
}
