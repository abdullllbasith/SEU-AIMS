import { ROLES } from '../../../shared/constants/roles.js';
import { ForbiddenError, ValidationError } from '../../../shared/errors/app-error.js';
import { SEARCH_MAX_LENGTH } from '../constants.js';

export function assertLecturer(principal) {
  if (!principal || principal.role !== ROLES.LECTURER) {
    throw new ForbiddenError('Forbidden');
  }
}

export function sanitizeWorkspaceSearch(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return '';
  }
  const text = String(raw).trim();
  if (text.length > SEARCH_MAX_LENGTH) {
    throw new ValidationError('Search is limited to 64 characters');
  }
  if (/[.*+?^${}()|[\]\\]/.test(text)) {
    throw new ValidationError('Search does not accept pattern characters');
  }
  return text;
}

export function prefixRegex(value) {
  return new RegExp(`^${value}`, 'i');
}

export function canManageAssignment({ assignment, offering, lecturerStatus }) {
  return Boolean(
    assignment &&
      assignment.isActive !== false &&
      offering &&
      offering.status === 'ACTIVE' &&
      lecturerStatus === 'VERIFIED',
  );
}
