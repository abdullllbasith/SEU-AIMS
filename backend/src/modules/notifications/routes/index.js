import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireDepartmentAdmin, requireRole } from '../../../shared/auth/authorize.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { requireCsrf } from '../../authentication/middleware/csrf.js';
import { createNotificationController } from '../controllers/notification.controller.js';

const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

export function createRouter() {
  const router = Router();
  const controller = createNotificationController();
  const roles = requireRole(ROLES.STUDENT, ROLES.LECTURER, ROLES.DEPARTMENT_ADMINISTRATOR);

  router.get('/', roles, controller.list);
  router.get('/unread-count', roles, controller.unread);
  router.get('/preferences', roles, controller.getPreferences);
  router.patch('/preferences', roles, requireCsrf, controller.patchPreferences);
  router.get('/admin/summary', requireDepartmentAdmin(), controller.adminSummary);
  router.post('/mark-all-read', roles, requireCsrf, readLimiter, controller.markAllRead);
  router.patch('/:notificationId/read', roles, requireCsrf, readLimiter, controller.markRead);

  return router;
}
