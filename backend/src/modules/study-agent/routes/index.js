import { Router } from 'express';
import multer from 'multer';
import { requireRole } from '../../../shared/auth/authorize.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { ValidationError } from '../../../shared/errors/app-error.js';
import { requireCsrf } from '../../authentication/middleware/csrf.js';
import { createStudyAgentController } from '../controllers/study-agent.controller.js';

/** Memory-buffered upload. Size is enforced per file type in the service; this is only the outer cap. */
function receiveFiles(req, res, next) {
  const config = req.app.get('config');
  const max = config.studyAgent.maxImages;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: Math.max(config.files.maxBytes, config.studyAgent.imageMaxBytes),
      files: max,
      fields: 5,
    },
  }).array('files', max);
  upload(req, res, (error) => {
    if (error?.name === 'MulterError' && error.code !== 'LIMIT_FILE_SIZE') {
      return next(new ValidationError('Too many files, or the upload field is wrong'));
    }
    return next(error);
  });
}

export function createRouter() {
  const router = Router();
  const controller = createStudyAgentController();
  const students = requireRole(ROLES.STUDENT);

  router.get('/access', students, controller.access);
  router.get('/subjects', students, controller.subjects);

  router.get('/sessions', students, controller.listSessions);
  router.post('/sessions', students, requireCsrf, controller.createSession);
  router.get('/sessions/:sessionId', students, controller.getSession);
  router.patch('/sessions/:sessionId', students, requireCsrf, controller.renameSession);
  router.delete('/sessions/:sessionId', students, requireCsrf, controller.archiveSession);
  router.post('/sessions/:sessionId/messages', students, requireCsrf, controller.sendMessage);
  router.get('/sessions/:sessionId/sources', students, controller.sessionSources);
  router.post('/sessions/:sessionId/attachments', students, requireCsrf, receiveFiles, controller.uploadAttachments);

  router.get('/attachments/:fileId', students, controller.attachmentStatus);
  router.get('/attachments/:fileId/content', students, controller.attachmentContent);
  router.delete('/attachments/:fileId', students, requireCsrf, controller.removeAttachment);

  return router;
}
