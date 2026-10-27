import { AppError } from './app-error.js';

export function mapMongoError(error) {
  if (error?.code === 11000) {
    return new AppError('Duplicate record', { statusCode: 409, code: 'DUPLICATE_RECORD' });
  }

  if (error?.name === 'ValidationError') {
    return new AppError('Validation failed', { statusCode: 400, code: 'VALIDATION_ERROR' });
  }

  return error;
}
