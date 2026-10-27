import { Router } from 'express';
import { requireDepartmentAdmin, requireRole } from '../../../shared/auth/authorize.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { requireCsrf } from '../../authentication/middleware/csrf.js';
import { createGpaController } from '../controllers/gpa.controller.js';

export function createRouter() {
  const router = Router();
  const controller = createGpaController();
  router.get('/me', requireRole(ROLES.STUDENT), controller.me);
  router.get('/admin/quality', requireDepartmentAdmin(), controller.quality);
  router.post('/admin/rebuild', requireDepartmentAdmin(), requireCsrf, controller.rebuild);
  return router;
}
