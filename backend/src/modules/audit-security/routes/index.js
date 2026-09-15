import { Router } from 'express';
import { requireDepartmentAdmin } from '../../../shared/auth/authorize.js';
import { requireCsrf } from '../../authentication/middleware/csrf.js';
import { createAuditController } from '../controllers/audit.controller.js';

export function createRouter() {
  const router = Router();
  const controller = createAuditController();
  const admin = requireDepartmentAdmin();

  router.get('/events', admin, controller.list);
  router.get('/summary', admin, controller.summary);
  router.patch('/events/:auditId', admin, requireCsrf, controller.rejectMutation);
  router.delete('/events/:auditId', admin, requireCsrf, controller.rejectMutation);
  router.put('/events/:auditId', admin, requireCsrf, controller.rejectMutation);

  return router;
}

export function createOpsRouter() {
  const router = Router();
  const controller = createAuditController();
  const admin = requireDepartmentAdmin();
  router.get('/metrics', admin, controller.ops);
  router.get('/queues', admin, controller.ops);
  router.get('/integrity', admin, controller.integrity);
  return router;
}

export function createWebhookRouter() {
  const router = Router();
  const controller = createAuditController();
  router.get('/whatsapp', controller.whatsappVerify);
  router.post('/whatsapp', controller.whatsappReceive);
  return router;
}

export function createHealthRouter() {
  const router = Router();
  const controller = createAuditController();
  router.get('/live', controller.live);
  router.get('/ready', controller.ready);
  return router;
}
