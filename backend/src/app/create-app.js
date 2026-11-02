import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { applySecurityMiddleware } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { registerModules } from './register-modules.js';
import { API_PATHS } from '../shared/constants/api-paths.js';
import { sendSuccess } from '../shared/http/api-response.js';
import { requireAuthenticated } from '../shared/auth/authorize.js';
import {
  createRequestContext,
  runWithRequestContext,
} from '../infrastructure/observability/request-context.js';
import { incrementMetric, observeDuration } from '../infrastructure/observability/metrics.js';

const PUBLIC_API = new Set([
  'GET /api/health',
  'GET /api/health/live',
  'GET /api/health/ready',
  'GET /api/auth/csrf',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/auth/refresh',
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
  'GET /api/webhooks/whatsapp',
  'POST /api/webhooks/whatsapp',
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
  const trustProxy = Number(config.api?.trustProxy);
  app.set('trust proxy', Number.isFinite(trustProxy) && trustProxy > 0 ? trustProxy : false);
  applySecurityMiddleware(app, { config, logger, redis: infrastructure.redis });
  app.use(
    express.json({
      limit: config.api.jsonBodyLimit,
      verify: (req, _res, buf) => {
        if (req.originalUrl?.startsWith('/api/webhooks/')) {
          req.rawBody = buf;
        }
      },
    }),
  );
  app.use(cookieParser());
  app.use((req, res, next) => {
    const context = createRequestContext(req);
    req.requestId = context.requestId;
    req.correlationId = context.correlationId;
    res.setHeader('X-Request-Id', context.requestId);
    res.setHeader('X-Correlation-Id', context.correlationId);
    runWithRequestContext(context, () => next());
  });
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      observeDuration('http.request', Date.now() - started);
      incrementMetric(`http.method.${req.method}`);
      logger.info('HTTP request', {
        method: req.method,
        route: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - started,
        requestId: req.requestId,
        role: req.principal?.role,
      });
    });
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

  // Optional: serve the built frontend from the API origin (single-origin deployment, e.g. Render).
  const frontendDist = config.api.frontendDist;
  if (frontendDist && fs.existsSync(path.join(frontendDist, 'index.html'))) {
    // The API default CSP is default-src 'none'; the SPA needs its own policy (mirrors frontend/index.html).
    const spaCsp =
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss: https://fonts.googleapis.com https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    app.use((req, res, next) => {
      if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
        res.setHeader('Content-Security-Policy', spaCsp);
      }
      next();
    });
    app.use(
      express.static(frontendDist, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.get(/^\/(?!api(\/|$)|socket\.io(\/|$)).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}

export { randomUUID };
