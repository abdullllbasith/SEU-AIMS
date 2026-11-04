import { AppError } from '../../shared/errors/app-error.js';
import { mapMongoError } from '../../shared/errors/mongo-error.js';
import { sendError } from '../../shared/http/api-response.js';
import { incrementMetric } from '../../infrastructure/observability/metrics.js';
import { currentRequestId } from '../../infrastructure/observability/request-context.js';

export function notFoundHandler(_req, _res, next) {
  next(new AppError('Not found', { statusCode: 404, code: 'NOT_FOUND' }));
}

export function errorHandler(logger) {
  return (error, req, res, _next) => {
    const mapped = mapMongoError(error);
    const multerTooLarge = error?.code === 'LIMIT_FILE_SIZE';
    const statusCode = multerTooLarge ? 413 : mapped.statusCode || 500;
    const code = multerTooLarge ? 'PAYLOAD_TOO_LARGE' : mapped.code || 'INTERNAL_ERROR';
    const safeMessage = multerTooLarge
      ? 'File too large'
      : statusCode >= 500 && mapped.expose !== true
        ? 'Internal error'
        : mapped.message;
    const requestId = currentRequestId() || req.requestId;

    incrementMetric(`http.status.${statusCode}`);
    if (statusCode === 401 || statusCode === 403) {
      incrementMetric('security.authorization_denied');
    }
    if (code === 'RATE_LIMITED' || statusCode === 429) {
      incrementMetric('security.rate_limited');
    }

    logger.error('Request failed', {
      code,
      statusCode,
      message: mapped.message,
      requestId,
      route: req.originalUrl,
      method: req.method,
      role: req.principal?.role,
    });

    if (statusCode >= 500 && req.app.get('config')?.isProduction === false) {
      return sendError(res, { statusCode, code, message: safeMessage, requestId });
    }

    return sendError(res, { statusCode, code, message: safeMessage, requestId });
  };
}
