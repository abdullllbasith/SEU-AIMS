import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { getDepartmentGpaQuality, getStudentGpaSummary, rebuildDepartmentGpa } from '../services/gpa.service.js';

export function createGpaController() {
  return {
    me: asyncHandler(async (req, res) => {
      if (req.principal?.role !== ROLES.STUDENT) {
        throw new ForbiddenError('Forbidden');
      }
      if (req.query.studentId && String(req.query.studentId) !== String(req.principal.userId)) {
        throw new ForbiddenError('Forbidden');
      }
      sendSuccess(res, await getStudentGpaSummary(req.principal.userId));
    }),
    quality: asyncHandler(async (req, res) => {
      sendSuccess(res, await getDepartmentGpaQuality(req.principal));
    }),
    rebuild: asyncHandler(async (req, res) => {
      sendSuccess(res, await rebuildDepartmentGpa(req.principal));
    }),
  };
}
