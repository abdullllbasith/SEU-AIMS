import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireDepartmentAdmin, requireRole } from '../../../shared/auth/authorize.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { requireCsrf } from '../../authentication/middleware/csrf.js';
import { createCaController } from '../controllers/ca.controller.js';

const verifyLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

export function createRouter() {
  const router = Router();
  const controller = createCaController();

  router.get('/verify/:token', verifyLimiter, controller.verifyToken);

  router.get('/conditions', requireRole(ROLES.STUDENT), controller.conditions);
  router.get('/windows/me', requireRole(ROLES.STUDENT), controller.windowsMe);
  router.get('/applications', requireRole(ROLES.STUDENT), controller.listMine);
  router.get('/applications/preview', requireRole(ROLES.STUDENT), controller.preview);
  router.post('/applications', requireRole(ROLES.STUDENT), requireCsrf, controller.createApplication);
  router.get('/applications/:applicationId', requireRole(ROLES.STUDENT, ROLES.DEPARTMENT_ADMINISTRATOR), controller.getMine);
  router.patch('/applications/:applicationId', requireRole(ROLES.STUDENT), requireCsrf, controller.patchMine);
  router.post('/applications/:applicationId/submit', requireRole(ROLES.STUDENT), requireCsrf, controller.submitMine);
  router.get('/applications/:applicationId/pdf', requireRole(ROLES.STUDENT, ROLES.DEPARTMENT_ADMINISTRATOR), controller.pdfMine);

  router.get('/admin/windows', requireDepartmentAdmin(), controller.adminWindows);
  router.post('/admin/windows', requireDepartmentAdmin(), requireCsrf, controller.saveWindow);
  router.delete('/admin/windows/:windowId', requireDepartmentAdmin(), requireCsrf, controller.deleteWindow);
  router.get('/admin/applications', requireDepartmentAdmin(), controller.adminList);
  router.post('/admin/applications/:applicationId/confirm-receipt', requireDepartmentAdmin(), requireCsrf, controller.confirmReceipt);
  router.post('/admin/applications/:applicationId/verify', requireDepartmentAdmin(), requireCsrf, controller.verifyPhysical);
  router.post('/admin/applications/:applicationId/approve', requireDepartmentAdmin(), requireCsrf, controller.approve);
  router.post('/admin/applications/:applicationId/reject', requireDepartmentAdmin(), requireCsrf, controller.reject);
  router.post('/admin/applications/:applicationId/reopen', requireDepartmentAdmin(), requireCsrf, controller.reopen);
  router.get('/admin/reconciliation', requireDepartmentAdmin(), controller.reconciliation);
  router.get('/admin/conditions', requireDepartmentAdmin(), controller.unresolvedConditions);
  router.post('/admin/backfill', requireDepartmentAdmin(), requireCsrf, controller.backfill);

  router.get('/lecturer/eligible-students', requireRole(ROLES.LECTURER), controller.lecturerEligible);
  router.get('/lecturer/schedules', requireRole(ROLES.LECTURER), controller.lecturerSchedules);
  router.post('/lecturer/schedules', requireRole(ROLES.LECTURER), requireCsrf, controller.createSchedule);
  router.post('/lecturer/schedules/:scheduleId/cancel', requireRole(ROLES.LECTURER), requireCsrf, controller.cancelSchedule);
  router.post('/lecturer/applications/:applicationId/complete', requireRole(ROLES.LECTURER), requireCsrf, controller.complete);

  router.get(
    '/recovery-results',
    requireRole(ROLES.DEPARTMENT_ADMINISTRATOR, ROLES.LECTURER),
    controller.listRecoveryReviews,
  );
  router.post(
    '/recovery-results/:reviewId/decision',
    requireRole(ROLES.DEPARTMENT_ADMINISTRATOR, ROLES.LECTURER),
    requireCsrf,
    controller.decideRecoveryReview,
  );

  return router;
}
