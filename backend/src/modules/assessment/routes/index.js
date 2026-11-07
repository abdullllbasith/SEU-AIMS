import { Router } from 'express';
import { requireDepartmentAdmin, requireRole } from '../../../shared/auth/authorize.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { requireCsrf } from '../../authentication/middleware/csrf.js';
import { createAssessmentController } from '../controllers/assessment.controller.js';

/** Every route answers 404 while ASSESSMENT_MARKS_ENABLED is off, as if the module did not exist. */
export function requireAssessmentEnabled(req, _res, next) {
  if (!req.app.get('config')?.features?.assessmentMarksEnabled) {
    return next(new NotFoundError('Not found'));
  }
  return next();
}

export function createRouter() {
  const router = Router();
  const controller = createAssessmentController();
  router.use(requireAssessmentEnabled);

  router.post('/lecturer/subjects/:linkId/attempt', requireRole(ROLES.LECTURER), requireCsrf, controller.openAttempt);
  router.get('/lecturer/attempts', requireRole(ROLES.LECTURER), controller.listLecturerAttempts);
  router.put('/attempts/:attemptId/marks', requireRole(ROLES.LECTURER), requireCsrf, controller.saveMarks);
  router.post('/attempts/:attemptId/submit', requireRole(ROLES.LECTURER), requireCsrf, controller.submitAttempt);

  router.get('/admin/attempts', requireDepartmentAdmin(), controller.listAdminAttempts);
  router.post('/attempts/:attemptId/verify', requireDepartmentAdmin(), requireCsrf, controller.verifyAttempt);
  router.post('/attempts/:attemptId/correct-marks', requireDepartmentAdmin(), requireCsrf, controller.correctMarks);
  router.post('/attempts/:attemptId/return', requireDepartmentAdmin(), requireCsrf, controller.returnAttempt);
  router.post('/attempts/:attemptId/board-authorization', requireDepartmentAdmin(), requireCsrf, controller.recordBoardAuthorization);
  router.post('/attempts/:attemptId/publish', requireDepartmentAdmin(), requireCsrf, controller.publishAttempt);
  router.post('/admin/subjects/:linkId/absent-attempt', requireDepartmentAdmin(), requireCsrf, controller.recordAbsentAttempt);
  router.post('/attempts/:attemptId/absence-claim', requireDepartmentAdmin(), requireCsrf, controller.recordAbsenceClaim);
  router.post('/attempts/:attemptId/absence-claim/:claimId/decision', requireDepartmentAdmin(), requireCsrf, controller.decideAbsenceClaim);
  return router;
}
