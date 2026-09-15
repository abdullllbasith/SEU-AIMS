import { AppError } from '../../shared/errors/app-error.js';
import { mapMongoError } from '../../shared/errors/mongo-error.js';
import { sendError } from '../../shared/http/api-response.js';

export function notFoundHandler(_req, _res, next) {
  next(new AppError('Not found', { statusCode: 404, code: 'NOT_FOUND' }));
}

export function errorHandler(logger) {
  return (error, _req, res, _next) => {
    const mapped = mapMongoError(error);
    const multerTooLarge = error?.code === 'LIMIT_FILE_SIZE';
    const statusCode = multerTooLarge ? 413 : mapped.statusCode || 500;
    const code = multerTooLarge ? 'PAYLOAD_TOO_LARGE' : mapped.code || 'INTERNAL_ERROR';
    const message = multerTooLarge
      ? 'File too large'
      : statusCode >= 500
        ? 'Internal error'
        : mapped.message;

    logger.error('Request failed', {
      code,
      statusCode,
      message: mapped.message,
    });

    return sendError(res, { statusCode, code, message });
  };
}
