import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { applySecurityMiddleware } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { registerModules } from './register-modules.js';
import { API_PATHS } from '../shared/constants/api-paths.js';
import { sendSuccess } from '../shared/http/api-response.js';
import { requireAuthenticated } from '../shared/auth/authorize.js';

const PUBLIC_API = new Set([
  'GET /api/health',
  'GET /api/auth/csrf',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/auth/refresh',
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
]);

function defaultDenyApi(req, res, next) {
  if (!req.path.startsWith('/api')) {
    return next();
  }

  const key = `${req.method} ${req.path}`;
  if (PUBLIC_API.has(key)) {
    return next();
  }
  if (req.method === 'GET' && req.path.startsWith('/api/ca/verify/')) {
    return next();
  }

  return requireAuthenticated(req, res, next);
}

export function createApp({ config, logger, infrastructure = {} }) {
  const app = express();
  app.set('config', config);
  app.set('infrastructure', infrastructure);
  app.set('trust proxy', 1);
  applySecurityMiddleware(app, { config });
  app.use(express.json({ limit: config.api.jsonBodyLimit }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    req.requestId = req.get('x-request-id') || randomUUID();
    next();
  });

  app.get(API_PATHS.health, (_req, res) => {
    sendSuccess(res, {
      service: 'seu-aims-api',
      status: 'ok',
    });
  });

  app.use(defaultDenyApi);
  registerModules(app, { config, logger, infrastructure });

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
