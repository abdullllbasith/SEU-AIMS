import { Router } from 'express';
import { requireRole } from '../../../shared/auth/authorize.js';
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
  return router;
}
