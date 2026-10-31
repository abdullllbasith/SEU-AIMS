import { Router } from 'express';
import { requireDepartmentAdmin } from '../../../shared/auth/authorize.js';
import { requireCsrf } from '../../authentication/middleware/csrf.js';
import { createAdminController } from '../controllers/admin.controller.js';

export function createRouter() {
  const router = Router();
  const controller = createAdminController();
  const admin = requireDepartmentAdmin();

  router.get('/dashboard', admin, controller.dashboard);
  router.get('/metrics', admin, controller.dashboard);
  router.get('/students', admin, controller.students);
  router.get('/students/:userId', admin, controller.studentDetail);
  router.get('/lecturers', admin, controller.lecturers);
  router.get('/lecturers/:userId', admin, controller.lecturerDetail);
  router.get('/offerings', admin, controller.offerings);
  router.get('/result-imports', admin, controller.resultImports);
  router.get('/result-imports/:importId', admin, controller.resultImportDetail);
  router.get('/ca-recovery/overview', admin, controller.caOverview);
  router.get('/ca-recovery/applications', admin, controller.caApplications);
  router.get('/notifications/health', admin, controller.notificationHealth);
  router.get('/calendar/health', admin, controller.calendarHealth);
  router.get('/storage/health', admin, controller.storageHealth);
  router.get('/jobs', admin, controller.jobs);
  router.post('/jobs/:jobId/retry', admin, requireCsrf, controller.retryJob);
  router.get('/audit', admin, controller.audit);
  router.get('/data-quality', admin, controller.dataQuality);
  router.get('/security', admin, controller.security);
  router.get('/exports/students.csv', admin, controller.exportStudents);

  router.post('/result-imports/:importId/mutate', admin, requireCsrf, controller.rejectMutation);
  router.patch('/students/:userId/results', admin, requireCsrf, controller.rejectMutation);
  router.post('/jobs/:jobName/force-success', admin, requireCsrf, controller.rejectJobForce);
  router.post('/jobs/execute', admin, requireCsrf, controller.rejectJobForce);

  return router;
}
