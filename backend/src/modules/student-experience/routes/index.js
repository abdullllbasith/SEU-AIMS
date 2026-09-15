import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { requireAuthenticated, requireRole } from '../../../shared/auth/authorize.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { requireCsrf } from '../../authentication/middleware/csrf.js';
import { PROFILE_IMAGE_MAX_BYTES } from '../../files/constants.js';
import { createStudentExperienceController } from '../controllers/experience.controller.js';

const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

function createUpload() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PROFILE_IMAGE_MAX_BYTES, files: 1 },
  });
}

export function createRouter() {
  const router = Router();
  const controller = createStudentExperienceController();
  const students = requireRole(ROLES.STUDENT);

  router.get('/profile', requireAuthenticated, controller.profile);
  router.patch('/profile', requireAuthenticated, requireCsrf, writeLimiter, controller.updateProfile);
  router.post(
    '/profile/photo',
    requireAuthenticated,
    requireCsrf,
    writeLimiter,
    (req, res, next) => createUpload().single('file')(req, res, next),
    controller.uploadPhoto,
  );
  router.get('/profile/photo', requireAuthenticated, controller.downloadPhoto);
  router.get('/academic-context', students, controller.academicContext);
  router.get('/academic-history', students, controller.academicHistory);
  router.get('/performance', students, controller.performance);
  router.get('/dashboard', students, controller.dashboard);

  return router;
}
