import { Router } from 'express';
import { requireAuthenticated, requireDepartmentAdmin } from '../../../shared/auth/authorize.js';
import { requireCsrf } from '../middleware/csrf.js';
import { createAuthRateLimiter } from '../middleware/auth-rate-limit.js';
import { createAuthController } from '../controllers/auth.controller.js';

export function createRouter({ config, logger, infrastructure } = {}) {
  const router = Router();
  if (!config) {
    return router;
  }

  const controller = createAuthController({ config, infrastructure });
  const loginLimiter = createAuthRateLimiter({ config, redis: infrastructure?.redis, logger });

  router.get('/csrf', controller.csrf);
  router.post('/login', loginLimiter, requireCsrf, controller.login);
  router.post('/logout', requireCsrf, controller.logout);
  router.post('/refresh', requireCsrf, controller.refresh);
  router.post('/forgot-password', loginLimiter, requireCsrf, controller.forgotPassword);
  router.post('/reset-password', requireCsrf, controller.resetPassword);
  router.get('/me', requireAuthenticated, controller.me);
  router.patch('/me', requireAuthenticated, requireCsrf, controller.updateMe);
  router.post('/change-password', requireAuthenticated, requireCsrf, controller.changePassword);
  router.post('/users', requireDepartmentAdmin(), requireCsrf, controller.createUser);
  router.patch('/users/:userId/status', requireDepartmentAdmin(), requireCsrf, controller.setStatus);
  router.patch('/users/:userId/password', requireDepartmentAdmin(), requireCsrf, controller.setPassword);

  router.get('/admins', requireDepartmentAdmin(), controller.listAdmins);
  router.post('/admins', requireDepartmentAdmin(), requireCsrf, controller.createAdmin);
  router.patch('/admins/:userId/status', requireDepartmentAdmin(), requireCsrf, controller.setAdminStatus);
  router.post('/admins/:userId/reset-password', requireDepartmentAdmin(), requireCsrf, controller.resetAdminPassword);

  return router;
}
