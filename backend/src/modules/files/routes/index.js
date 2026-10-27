import { Router } from 'express';
import { requireDepartmentAdmin } from '../../../shared/auth/authorize.js';
import { createFilesController } from '../controllers/files.controller.js';

export function createRouter() {
  const router = Router();
  const controller = createFilesController();
  router.get('/admin/reconciliation', requireDepartmentAdmin(), controller.reconciliation);
  return router;
}
