import { Router } from 'express';
import { requireAuthenticated } from '../../../shared/auth/authorize.js';
import { canAccessStudyRoom } from '../../authentication/policies/authorization.policies.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';

export function createRouter() {
  const router = Router();
  router.use(requireAuthenticated);
  router.get(
    '/access',
    asyncHandler(async (req, res) => {
      if (!canAccessStudyRoom(req.principal)) {
        throw new ForbiddenError('Study Room is student-only');
      }
      sendSuccess(res, { allowed: true });
    }),
  );
  return router;
}
