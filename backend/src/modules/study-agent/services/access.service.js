import { StudentAcademicContext } from '../../academic-foundation/index.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';

/** Study Agent is student-only and needs an active academic context. */
export async function requireAgentStudent(principal) {
  if (!principal || principal.role !== ROLES.STUDENT) {
    throw new ForbiddenError('Study Agent is student-only');
  }
  const context = await StudentAcademicContext.findOne({ userId: principal.userId, status: 'ACTIVE' });
  if (!context) {
    throw new ForbiddenError('Study Agent requires an active academic context');
  }
  return { context };
}

export async function getAccess(principal) {
  await requireAgentStudent(principal);
  return { enabled: true };
}
