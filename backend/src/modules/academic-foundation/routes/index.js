import { Router } from 'express';
import { requireAuthenticated, requireDepartmentAdmin, requireRole } from '../../../shared/auth/authorize.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { requireCsrf } from '../../authentication/middleware/csrf.js';
import { createAcademicController } from '../controllers/academic.controller.js';

export function createRouter() {
  const router = Router();
  const controller = createAcademicController();

  router.get('/me/context', requireRole(ROLES.STUDENT), controller.myContext);
  router.get('/me/offerings', requireRole(ROLES.STUDENT, ROLES.LECTURER), controller.myOfferings);
  router.get('/subject-offerings/:offeringId', requireAuthenticated, controller.getOffering);

  const admin = requireDepartmentAdmin();
  router.get('/overview', admin, controller.overview);
  router.get('/admin/reconciliation', admin, controller.reconciliation);
  router.get('/departments', admin, controller.listDepartments);
  router.post('/departments', admin, requireCsrf, controller.createDepartment);
  router.patch('/departments/:departmentId', admin, requireCsrf, controller.updateDepartment);

  router.get('/batches', admin, controller.listBatches);
  router.post('/batches', admin, requireCsrf, controller.createBatch);
  router.get('/batches/:batchId', admin, controller.getBatch);
  router.post('/batches/:batchId/academic-context', admin, requireCsrf, controller.assignBatchAcademicContext);
  router.patch('/batches/:batchId/academic-context', admin, requireCsrf, controller.reviseBatchAcademicContext);
  router.get('/batches/:batchId/offering-generation', admin, controller.previewBatchOfferings);
  router.post('/batches/:batchId/offering-generation', admin, requireCsrf, controller.generateBatchOfferings);
  router.get('/batches/:batchId/progression', admin, controller.previewBatchProgression);
  router.post('/batches/:batchId/progression', admin, requireCsrf, controller.progressBatch);
  router.patch('/batches/:batchId', admin, requireCsrf, controller.updateBatch);

  router.get('/academic-years', admin, controller.listAcademicYears);
  router.post('/academic-years', admin, requireCsrf, controller.createAcademicYear);
  router.patch('/academic-years/:yearId', admin, requireCsrf, controller.updateAcademicYear);
  router.delete('/academic-years/:yearId', admin, requireCsrf, controller.deleteAcademicYear);

  router.get('/semesters', admin, controller.listSemesters);
  router.post('/semesters', admin, requireCsrf, controller.createSemester);
  router.patch('/semesters/:semesterId', admin, requireCsrf, controller.updateSemester);
  router.delete('/semesters/:semesterId', admin, requireCsrf, controller.deleteSemester);

  router.get('/catalog-import', admin, controller.previewCatalogImport);
  router.post('/catalog-import', admin, requireCsrf, controller.commitCatalogImport);
  router.get('/curriculum-mappings', admin, controller.listCurriculumMappings);
  router.post('/curriculum-mappings', admin, requireCsrf, controller.createCurriculumMapping);
  router.patch('/curriculum-mappings/:mappingId', admin, requireCsrf, controller.updateCurriculumMapping);

  router.get('/subjects', admin, controller.listSubjects);
  router.post('/subjects', admin, requireCsrf, controller.createSubject);
  router.patch('/subjects/:subjectId', admin, requireCsrf, controller.updateSubject);

  router.get('/subject-offerings', admin, controller.listOfferings);
  router.post('/subject-offerings/from-curriculum', admin, requireCsrf, controller.assignPeriodOfferings);
  router.post('/subject-offerings', admin, requireCsrf, controller.createOffering);
  router.get('/subject-offerings/:offeringId/enrollments', admin, controller.listOfferingEnrollments);
  router.post(
    '/subject-offerings/:offeringId/enrollments',
    admin,
    requireCsrf,
    controller.createOfferingEnrollment,
  );
  router.patch('/subject-offerings/:offeringId', admin, requireCsrf, controller.updateOffering);
  router.patch('/enrollments/:enrollmentId', admin, requireCsrf, controller.cancelEnrollment);

  router.get('/members', admin, controller.listMembers);
  router.patch('/lecturers/:userId/status', admin, requireCsrf, controller.setLecturerVerification);

  router.get('/lecturer-assignments', admin, controller.listAssignments);
  router.post('/lecturer-assignments', admin, requireCsrf, controller.assignLecturer);
  router.patch('/lecturer-assignments/:assignmentId', admin, requireCsrf, controller.revokeAssignment);

  router.get('/students', admin, controller.listStudentContexts);
  router.post('/students', admin, requireCsrf, controller.createStudentContext);
  router.get('/students/:contextId/enrollments', admin, controller.listStudentEnrollments);
  router.get('/students/:contextId', admin, controller.getStudentContext);
  router.patch('/students/:contextId', admin, requireCsrf, controller.updateStudentContext);
  router.delete('/students/:contextId', admin, requireCsrf, controller.deleteStudentContext);

  return router;
}
