import { Router } from 'express';
import multer from 'multer';
import {
  requireAuthenticated,
  requireDepartmentAdmin,
  requireRole,
} from '../../../shared/auth/authorize.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { requireCsrf } from '../../authentication/middleware/csrf.js';
import { createLearningController } from '../controllers/learning.controller.js';

function createUpload(config) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config?.files?.maxBytes || 20 * 1024 * 1024, files: 1 },
  });
}

export function createRouter() {
  const router = Router();
  const controller = createLearningController();
  const managers = requireRole(ROLES.LECTURER, ROLES.DEPARTMENT_ADMINISTRATOR);

  router.get('/offerings', requireAuthenticated, controller.offerings);
  router.get('/offerings/:offeringId', requireAuthenticated, controller.offeringPage);
  router.get('/offerings/:offeringId/sections', requireAuthenticated, controller.listSections);
  router.get('/offerings/:offeringId/resources', requireAuthenticated, controller.listResources);
  router.get('/resources/:resourceId', requireAuthenticated, controller.getResource);
  router.get('/resources/:resourceId/versions', managers, controller.resourceVersions);
  router.get('/resources/:resourceId/download', requireAuthenticated, controller.downloadResource);

  router.post('/offerings/:offeringId/sections', managers, requireCsrf, controller.createSection);
  router.patch('/sections/:sectionId', managers, requireCsrf, controller.updateSection);
  router.delete('/sections/:sectionId', managers, requireCsrf, controller.deleteSection);

  router.post('/offerings/:offeringId/resources', managers, requireCsrf, (req, res, next) => {
    const upload = createUpload(req.app.get('config'));
    upload.single('file')(req, res, next);
  }, controller.createResource);

  router.patch('/resources/:resourceId', managers, requireCsrf, controller.updateResource);
  router.post('/resources/:resourceId/publish', managers, requireCsrf, controller.publishResource);
  router.post('/resources/:resourceId/unpublish', managers, requireCsrf, controller.unpublishResource);
  router.post('/resources/:resourceId/replace', managers, requireCsrf, (req, res, next) => {
    const upload = createUpload(req.app.get('config'));
    upload.single('file')(req, res, next);
  }, controller.replaceResource);
  router.post('/resources/:resourceId/archive', managers, requireCsrf, controller.archiveResource);

  router.get('/admin/reconciliation', requireDepartmentAdmin(), controller.reconciliation);
  router.get('/admin/resources', requireDepartmentAdmin(), controller.adminResources);

  return router;
}
