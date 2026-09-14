import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

export function applySecurityMiddleware(app, { config }) {
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: config.api.corsOrigin,
      credentials: true,
    }),
  );
  app.use(
    rateLimit({
      windowMs: config.api.rateLimitWindowMs,
      max: config.api.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
}
