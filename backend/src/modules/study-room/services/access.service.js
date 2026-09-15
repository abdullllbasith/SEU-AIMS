import { StudentAcademicContext } from '../../academic-foundation/index.js';
import { StudyRoomSettings } from '../models/index.js';
import { ForbiddenError, NotFoundError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { canAccessStudyRoom, canModerateStudyRoom } from '../policies/study-room.policies.js';

export async function getOrCreateSettings(departmentId) {
  let settings = await StudyRoomSettings.findOne({ departmentId });
  if (!settings) {
    settings = await StudyRoomSettings.create({
      departmentId,
      enabled: true,
      moderationMode: 'ADMIN_REVIEW',
    });
  }
  return settings;
}

export async function requireStudentScope(principal) {
  if (!canAccessStudyRoom(principal)) {
    throw new ForbiddenError('Study Room is student-only');
  }
  const context = await StudentAcademicContext.findOne({
    userId: principal.userId,
    status: 'ACTIVE',
  });
  if (!context) {
    throw new ForbiddenError('Study Room requires an active academic context');
  }
  const settings = await getOrCreateSettings(context.departmentId);
  if (!settings.enabled) {
    throw new ForbiddenError('Study Room is not enabled for this department');
  }
  return { context, settings };
}

export async function requireModerator(principal) {
  if (principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
  if (!canModerateStudyRoom(principal, principal.departmentId)) {
    throw new ForbiddenError('Forbidden');
  }
  const settings = await getOrCreateSettings(principal.departmentId);
  return { settings };
}

export function conceal(entityLabel = 'Resource') {
  return new NotFoundError(`${entityLabel} not found`);
}
