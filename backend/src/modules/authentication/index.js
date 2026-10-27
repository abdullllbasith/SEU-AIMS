/**
 * Public API for the authentication module.
 * Other modules must import from this file only.
 */
import { Router } from 'express';
import { createRouter } from './routes/index.js';
import { createAuthController } from './controllers/auth.controller.js';
import { requireAuthenticated } from '../../shared/auth/authorize.js';

export const MODULE_ID = 'authentication';
export const API_PREFIX = '/api/auth';

export function createAuthenticationModule(deps = {}) {
  const router = createRouter(deps);
  const meRouter = Router();
  if (deps.config) {
    const controller = createAuthController(deps);
    meRouter.get('/me', requireAuthenticated, controller.me);
  }
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
    additionalRoutes: [{ prefix: '/api', router: meRouter }],
  };
}

export { createRouter };
export { User } from './models/user.model.js';
export { AuthSession } from './models/auth-session.model.js';
export { PasswordResetToken } from './models/password-reset-token.model.js';
export {
  canAccessStudyRoom,
  canViewStudentOwnedRecord,
  canManageSubjectOffering,
  canActAsDepartmentAdmin,
} from './policies/authorization.policies.js';
export { hashPassword } from './security/passwords.js';
export { requireCsrf } from './middleware/csrf.js';
