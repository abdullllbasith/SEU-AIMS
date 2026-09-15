import { User } from '../../authentication/models/user.model.js';
import {
  StudentAcademicContext,
  SubjectOffering,
} from '../../academic-foundation/index.js';
import { ROLES } from '../../../shared/constants/roles.js';

export async function resolveNoticeRecipientIds(notice) {
  const targeting = notice.targeting || {};
  const departmentId = notice.departmentId;
  if (targeting.kind === 'ROLE' && targeting.role) {
    const users = await User.find({
      departmentId,
      role: targeting.role,
      accountStatus: 'ACTIVE',
    }).select('_id');
    return users.map((item) => item._id);
  }
  if (targeting.kind === 'ALL_STUDENTS') {
    const users = await User.find({
      departmentId,
      role: ROLES.STUDENT,
      accountStatus: 'ACTIVE',
    }).select('_id');
    return users.map((item) => item._id);
  }
  const contextFilter = { departmentId };
  if (targeting.kind === 'BATCH') {
    contextFilter.batchId = targeting.batchId;
  }
  if (targeting.kind === 'ACADEMIC_YEAR') {
    contextFilter.currentAcademicYearId = targeting.academicYearId;
  }
  if (targeting.kind === 'SEMESTER') {
    contextFilter.currentSemesterId = targeting.semesterId;
  }
  if (targeting.kind === 'SUBJECT') {
    const offerings = await SubjectOffering.find({
      departmentId,
      subjectId: targeting.subjectId,
    }).select('_id batchId academicYearId semesterId');
    const or = offerings.map((item) => ({
      batchId: item.batchId,
      currentAcademicYearId: item.academicYearId,
      currentSemesterId: item.semesterId,
    }));
    if (!or.length) {
      return [];
    }
    const contexts = await StudentAcademicContext.find({ departmentId, $or: or }).select('userId');
    return [...new Set(contexts.map((item) => String(item.userId)))];
  }
  const contexts = await StudentAcademicContext.find(contextFilter).select('userId');
  return [...new Set(contexts.map((item) => String(item.userId)))];
}

export function noticeVisibleToPrincipal(notice, principal, context) {
  if (!principal?.departmentId || String(notice.departmentId) !== String(principal.departmentId)) {
    return false;
  }
  if (notice.publicationState !== 'PUBLISHED') {
    return principal.role === ROLES.DEPARTMENT_ADMINISTRATOR;
  }
  if (notice.expiresAt && notice.expiresAt.getTime() < Date.now()) {
    return principal.role === ROLES.DEPARTMENT_ADMINISTRATOR;
  }
  const targeting = notice.targeting || {};
  if (targeting.kind === 'ROLE') {
    return principal.role === targeting.role || principal.role === ROLES.DEPARTMENT_ADMINISTRATOR;
  }
  if (principal.role === ROLES.DEPARTMENT_ADMINISTRATOR) {
    return String(notice.departmentId) === String(principal.departmentId);
  }
  if (principal.role === ROLES.LECTURER) {
    return targeting.kind === 'ROLE' && targeting.role === ROLES.LECTURER;
  }
  if (!context) {
    return false;
  }
  if (targeting.kind === 'ALL_STUDENTS') {
    return true;
  }
  if (targeting.kind === 'BATCH') {
    return String(context.batchId) === String(targeting.batchId);
  }
  if (targeting.kind === 'ACADEMIC_YEAR') {
    return String(context.currentAcademicYearId) === String(targeting.academicYearId);
  }
  if (targeting.kind === 'SEMESTER') {
    return String(context.currentSemesterId) === String(targeting.semesterId);
  }
  if (targeting.kind === 'SUBJECT') {
    return Boolean(context.subjectMatch);
  }
  return false;
}
