export class AppError extends Error {
  /**
   * @param {string} message
   * @param {{ statusCode?: number, code?: string, details?: unknown }} [options]
   */
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, { statusCode: 404, code: 'NOT_FOUND' });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, { statusCode: 401, code: 'UNAUTHORIZED' });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, { statusCode: 403, code: 'FORBIDDEN' });
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details) {
    super(message, { statusCode: 400, code: 'VALIDATION_ERROR', details });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, { statusCode: 409, code: 'CONFLICT' });
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'File too large') {
    super(message, { statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
  }
}

export class UnsupportedMediaError extends AppError {
  constructor(message = 'Unsupported media type') {
    super(message, { statusCode: 415, code: 'UNSUPPORTED_MEDIA' });
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, { statusCode: 429, code: 'TOO_MANY_REQUESTS' });
  }
}
