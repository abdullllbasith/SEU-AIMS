import { Router } from 'express';
import { requireRole } from '../../../shared/auth/authorize.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { createGpaController } from '../controllers/gpa.controller.js';

export function createRouter() {
  const router = Router();
  const controller = createGpaController();
  router.get('/me', requireRole(ROLES.STUDENT), controller.me);
  return router;
}
