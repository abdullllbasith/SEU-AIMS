import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireRole } from '../../../shared/auth/authorize.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { requireCsrf } from '../../authentication/middleware/csrf.js';
import { createLecturerWorkspaceController } from '../controllers/lecturer.controller.js';

const readLimiter = rateLimit({
  windowMs: 60_000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
});

export function createRouter() {
  const router = Router();
  const controller = createLecturerWorkspaceController();
  const lecturers = requireRole(ROLES.LECTURER);

  router.get('/dashboard', lecturers, readLimiter, controller.dashboard);
  router.get('/subject-offerings', lecturers, readLimiter, controller.offerings);
  router.get('/subject-offerings/:offeringId', lecturers, readLimiter, controller.offering);
  router.get('/upcoming', lecturers, readLimiter, controller.upcoming);
  router.get('/search', lecturers, readLimiter, controller.search);
  router.get('/assignments', lecturers, readLimiter, controller.assignments);
  router.get('/ca-recovery/eligible-students', lecturers, readLimiter, controller.caEligible);
  router.get('/ca-recovery/schedules', lecturers, readLimiter, controller.caSchedules);

  router.post('/ca-recovery/approve', lecturers, requireCsrf, controller.rejectCaApprove);
  router.post('/results', lecturers, requireCsrf, controller.rejectResults);
  router.post('/assignments', lecturers, requireCsrf, controller.rejectAssignmentWrite);
  router.patch('/assignments/:id', lecturers, requireCsrf, controller.rejectAssignmentWrite);
  router.post('/subject-offerings/:offeringId/resources', lecturers, requireCsrf, controller.rejectResourceWrite);
  router.post('/resources/:id/publish', lecturers, requireCsrf, controller.rejectResourceWrite);

  return router;
}
