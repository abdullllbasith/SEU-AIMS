import mongoose from 'mongoose';
import { NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';

export function requireObjectId(value, label) {
  if (!mongoose.isValidObjectId(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return String(value);
}

/** Unknown, foreign and archived IDs all look the same to the caller. */
export function conceal(label = 'Item') {
  return new NotFoundError(`${label} not found`);
}

export function parseLimit(value, { max = 50, fallback = 20 } = {}) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new ValidationError('limit must be a positive integer');
  }
  return Math.min(parsed, max);
}
