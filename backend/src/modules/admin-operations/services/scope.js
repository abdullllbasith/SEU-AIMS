import mongoose from 'mongoose';
import { ForbiddenError, ValidationError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { SEARCH_MAX_LENGTH } from '../constants.js';

export function assertDepartmentAdmin(principal) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
  return principal.departmentId;
}

export function departmentObjectId(principal) {
  return new mongoose.Types.ObjectId(assertDepartmentAdmin(principal));
}

export function parseObjectId(value, field = 'id') {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const text = String(value);
  if (!/^[a-fA-F0-9]{24}$/.test(text)) {
    throw new ValidationError(`Invalid ${field}`);
  }
  return new mongoose.Types.ObjectId(text);
}

export function parsePage(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize };
}

export function sanitizeSearch(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return '';
  }
  const text = String(raw).trim();
  if (text.length > SEARCH_MAX_LENGTH) {
    throw new ValidationError(`Search is limited to ${SEARCH_MAX_LENGTH} characters`);
  }
  if (/[.*+?^${}()|[\]\\]/.test(text)) {
    throw new ValidationError('Search does not accept pattern characters');
  }
  return text;
}

export function prefixRegex(value) {
  return new RegExp(`^${value}`, 'i');
}

export function containsRegex(value) {
  return new RegExp(value, 'i');
}

export function ignoreClientDepartment(query = {}) {
  if (query.departmentId) {
    return true;
  }
  return false;
}
