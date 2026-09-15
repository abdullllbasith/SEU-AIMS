import { Router } from 'express';
import multer from 'multer';
import { requireDepartmentAdmin, requireRole } from '../../../shared/auth/authorize.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { requireCsrf } from '../../authentication/middleware/csrf.js';
import { createResultsController } from '../controllers/results.controller.js';

function createUpload(config) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config?.files?.maxBytes || 20 * 1024 * 1024, files: 1 },
  });
}

export function createRouter() {
  const router = Router();
  const controller = createResultsController();

  router.get('/me', requireRole(ROLES.STUDENT), controller.myResults);

  router.get('/imports', requireDepartmentAdmin(), controller.listImports);
  router.get('/imports/:importId', requireDepartmentAdmin(), controller.getImport);
  router.get('/imports/:importId/preview', requireDepartmentAdmin(), controller.previewImport);
  router.post('/imports', requireDepartmentAdmin(), requireCsrf, (req, res, next) => {
    const upload = createUpload(req.app.get('config'));
    upload.single('file')(req, res, next);
  }, controller.createImport);
  router.post('/imports/:importId/commit', requireDepartmentAdmin(), requireCsrf, controller.commitImport);

  return router;
}
