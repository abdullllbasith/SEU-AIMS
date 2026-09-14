import { ROLES } from '../../../shared/constants/roles.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { canActAsDepartmentAdmin } from '../../authentication/policies/authorization.policies.js';

export function assertDepartmentAdmin(principal) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR) {
    throw new ForbiddenError('Forbidden');
  }
}

export function assertDepartmentScope(principal, departmentId) {
  assertDepartmentAdmin(principal);
  if (!canActAsDepartmentAdmin(principal, departmentId)) {
    throw new ForbiddenError('Forbidden');
  }
}

export function canLecturerAccessOffering(principal, assignment) {
  return Boolean(
    principal &&
      principal.role === ROLES.LECTURER &&
      assignment &&
      assignment.isActive !== false &&
      String(assignment.lecturerUserId) === String(principal.userId),
  );
}

export function canStudentAccessOwnContext(principal, context) {
  return Boolean(
    principal &&
      principal.role === ROLES.STUDENT &&
      context &&
      String(context.userId) === String(principal.userId),
  );
}

export function isOfferingInStudentCurrentContext(context, offering) {
  if (!context || !offering) {
    return false;
  }

  return (
    String(context.batchId) === String(offering.batchId) &&
    String(context.currentAcademicYearId) === String(offering.academicYearId) &&
    String(context.currentSemesterId) === String(offering.semesterId) &&
    String(context.departmentId) === String(offering.departmentId)
  );
}
