import { ROLES } from '../../../shared/constants/roles.js';

export function canAccessStudyRoom(principal) {
  return Boolean(principal && principal.role === ROLES.STUDENT);
}

export function canViewStudentOwnedRecord(principal, ownerUserId) {
  if (!principal || !ownerUserId) {
    return false;
  }

  if (principal.role === ROLES.STUDENT) {
    return String(principal.userId) === String(ownerUserId);
  }

  return false;
}

export function canManageSubjectOffering(principal, assignment) {
  if (!principal || principal.role !== ROLES.LECTURER) {
    return false;
  }

  return Boolean(
    assignment &&
      assignment.isActive !== false &&
      String(assignment.lecturerUserId) === String(principal.userId),
  );
}

export function canActAsDepartmentAdmin(principal, departmentId) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR) {
    return false;
  }

  if (!departmentId || !principal.departmentId) {
    return Boolean(principal.role === ROLES.DEPARTMENT_ADMINISTRATOR);
  }

  return String(principal.departmentId) === String(departmentId);
}

export function isUsableAccount(user) {
  return user?.accountStatus === 'ACTIVE';
}
