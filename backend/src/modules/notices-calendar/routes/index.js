import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { requireDepartmentAdmin, requireRole } from '../../../shared/auth/authorize.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { requireCsrf } from '../../authentication/middleware/csrf.js';
import { createCalendarController, createNoticeController } from '../controllers/communication.controller.js';

const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

export function createNoticesRouter() {
  const router = Router();
  const controller = createNoticeController();
  router.get('/', requireRole(ROLES.STUDENT, ROLES.LECTURER, ROLES.DEPARTMENT_ADMINISTRATOR), controller.list);
  router.post('/admin', requireDepartmentAdmin(), requireCsrf, writeLimiter, controller.create);
  router.patch('/admin/:noticeId', requireDepartmentAdmin(), requireCsrf, controller.update);
  router.post('/admin/:noticeId/images', requireDepartmentAdmin(), requireCsrf, (req, res, next) => {
    multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 4 * 1024 * 1024, files: 1 },
    }).single('file')(req, res, next);
  }, controller.addImage);
  router.delete('/admin/:noticeId/images/:imageId', requireDepartmentAdmin(), requireCsrf, controller.removeImage);
  router.patch('/admin/:noticeId/images', requireDepartmentAdmin(), requireCsrf, controller.reorderImages);
  router.post('/admin/:noticeId/publish', requireDepartmentAdmin(), requireCsrf, writeLimiter, controller.publish);
  router.post('/admin/:noticeId/archive', requireDepartmentAdmin(), requireCsrf, controller.archive);
  router.get(
    '/:noticeId/images/:imageId',
    requireRole(ROLES.STUDENT, ROLES.LECTURER, ROLES.DEPARTMENT_ADMINISTRATOR),
    controller.image,
  );
  router.get('/:noticeId', requireRole(ROLES.STUDENT, ROLES.LECTURER, ROLES.DEPARTMENT_ADMINISTRATOR), controller.get);
  return router;
}

export function createCalendarRouter() {
  const router = Router();
  const controller = createCalendarController();
  router.get('/events', requireRole(ROLES.STUDENT, ROLES.LECTURER, ROLES.DEPARTMENT_ADMINISTRATOR), controller.list);
  router.get('/admin/reconciliation', requireDepartmentAdmin(), controller.reconciliation);
  router.get('/upcoming', requireRole(ROLES.STUDENT, ROLES.LECTURER, ROLES.DEPARTMENT_ADMINISTRATOR), controller.upcoming);
  router.post('/admin/events', requireDepartmentAdmin(), requireCsrf, writeLimiter, controller.adminCreate);
  router.patch('/admin/events/:eventId', requireDepartmentAdmin(), requireCsrf, controller.update);
  router.post('/admin/events/:eventId/publish', requireDepartmentAdmin(), requireCsrf, controller.publish);
  router.post('/admin/events/:eventId/cancel', requireDepartmentAdmin(), requireCsrf, controller.cancel);
  router.post('/lecturer/events', requireRole(ROLES.LECTURER), requireCsrf, writeLimiter, controller.lecturerCreate);
  router.patch('/lecturer/events/:eventId', requireRole(ROLES.LECTURER), requireCsrf, controller.update);
  router.post('/lecturer/events/:eventId/cancel', requireRole(ROLES.LECTURER), requireCsrf, controller.cancel);
  router.get('/events/:eventId', requireRole(ROLES.STUDENT, ROLES.LECTURER, ROLES.DEPARTMENT_ADMINISTRATOR), controller.get);
  return router;
}

export function createRouter() {
  return createNoticesRouter();
}
