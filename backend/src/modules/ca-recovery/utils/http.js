import mongoose from 'mongoose';
import { ValidationError } from '../../../shared/errors/app-error.js';

export function requireObjectId(value, label) {
  if (!mongoose.isValidObjectId(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return value;
}

export function parsePagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, limit: pageSize };
}

export function nowMs() {
  return Date.now();
}

export function isAtOrBeforeDeadline(now, closesAt) {
  return new Date(now).getTime() <= new Date(closesAt).getTime();
}

export function windowLifecycle(windowDoc, now = new Date()) {
  if (!windowDoc) {
    return 'UNPUBLISHED';
  }
  if (!windowDoc.published) {
    return 'UNPUBLISHED';
  }
  if (windowDoc.suspended) {
    return 'SUSPENDED';
  }
  const t = new Date(now).getTime();
  if (t < new Date(windowDoc.opensAt).getTime()) {
    return 'SCHEDULED';
  }
  if (t > new Date(windowDoc.closesAt).getTime()) {
    return 'CLOSED';
  }
  return 'OPEN';
}
