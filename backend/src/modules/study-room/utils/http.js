import mongoose from 'mongoose';
import { ValidationError } from '../../../shared/errors/app-error.js';

export function requireObjectId(value, label) {
  if (!mongoose.isValidObjectId(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return value;
}

export function parsePagination(query = {}, max = 50) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(max, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, limit: pageSize };
}

export function parseCursor(query = {}) {
  const before = query.before;
  if (before && !mongoose.isValidObjectId(before)) {
    throw new ValidationError('Invalid cursor');
  }
  return before || null;
}

export function parseHistoryLimit(query = {}, max = 50, fallback = 30) {
  const ceiling = Math.max(1, Number.parseInt(max, 10) || 50);
  const defaultLimit = Math.min(ceiling, Math.max(1, Number.parseInt(fallback, 10) || 30));
  if (query.limit === undefined || query.limit === null || query.limit === '') {
    return defaultLimit;
  }
  const parsed = Number.parseInt(query.limit, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new ValidationError('limit must be a positive integer');
  }
  return Math.min(parsed, ceiling);
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function participantKey(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join(':');
}

export function isClientMessageId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(value);
}
