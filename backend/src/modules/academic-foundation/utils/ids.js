import mongoose from 'mongoose';
import { ValidationError } from '../../../shared/errors/app-error.js';

export function requireObjectId(value, label) {
  if (!mongoose.isValidObjectId(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return value;
}
