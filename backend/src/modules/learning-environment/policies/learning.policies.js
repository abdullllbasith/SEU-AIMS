import { ROLES } from '../../../shared/constants/roles.js';
import { canLecturerAccessOffering } from '../../academic-foundation/policies/academic.policies.js';
import { canActAsDepartmentAdmin } from '../../authentication/policies/authorization.policies.js';

export function canStudentAccessOffering(principal, context, offering, historyRows = []) {
  if (!principal || principal.role !== ROLES.STUDENT || !context || !offering) {
    return false;
  }
  if (String(context.userId) !== String(principal.userId)) {
    return false;
  }
  if (String(context.departmentId) !== String(offering.departmentId)) {
    return false;
  }
  if (String(context.batchId) !== String(offering.batchId)) {
    return false;
  }

  const currentMatch =
    String(context.currentAcademicYearId) === String(offering.academicYearId) &&
    String(context.currentSemesterId) === String(offering.semesterId);
  if (currentMatch) {
    return true;
  }

  return historyRows.some(
    (row) =>
      String(row.academicYearId) === String(offering.academicYearId) &&
      String(row.semesterId) === String(offering.semesterId),
  );
}

export function canManageOfferingResources(principal, offering, assignment) {
  if (!principal || !offering) {
    return false;
  }
  if (principal.role === ROLES.DEPARTMENT_ADMINISTRATOR) {
    return canActAsDepartmentAdmin(principal, offering.departmentId);
  }
  if (principal.role === ROLES.LECTURER) {
    return canLecturerAccessOffering(principal, assignment);
  }
  return false;
}

export function isStudentVisibleResource(resource, file) {
  return Boolean(
    resource &&
      !resource.deletedAt &&
      resource.publicationState === 'PUBLISHED' &&
      file &&
      file.scanStatus === 'SAFE' &&
      file.availability === 'AVAILABLE',
  );
}
