import { Router } from 'express';
import multer from 'multer';
import { requireDepartmentAdmin, requireRole } from '../../../shared/auth/authorize.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { requireCsrf } from '../../authentication/middleware/csrf.js';
import { createStudyRoomController } from '../controllers/study-room.controller.js';

function createUpload(config) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config?.files?.maxBytes || 20 * 1024 * 1024, files: 1 },
  });
}

export function createRouter() {
  const router = Router();
  const controller = createStudyRoomController();
  const students = requireRole(ROLES.STUDENT);
  const admins = requireDepartmentAdmin();

  router.get('/access', students, controller.access);
  router.put('/crypto/public-key', students, requireCsrf, controller.upsertKey);
  router.get('/crypto/public-keys/:userId', students, controller.getPublicKey);
  router.get('/students/search', students, controller.searchStudents);

  router.get('/conversations', students, controller.conversations);
  router.post('/conversations', students, requireCsrf, controller.createConversation);
  router.get('/conversations/:conversationId', students, controller.getConversation);
  router.put('/conversations/:conversationId/key-envelopes', students, requireCsrf, controller.putEnvelopes);
  router.get('/conversations/:conversationId/messages', students, controller.listMessages);
  router.post('/conversations/:conversationId/messages', students, requireCsrf, controller.sendMessage);
  router.patch('/conversations/:conversationId/read', students, requireCsrf, controller.markRead);
  router.patch('/conversations/:conversationId/messages/:messageId', students, requireCsrf, controller.editMessage);
  router.delete('/conversations/:conversationId/messages/:messageId', students, requireCsrf, controller.deleteMessage);

  router.get('/folders', students, controller.listFolders);
  router.post('/folders', students, requireCsrf, controller.createFolder);
  router.get('/folders/:folderId', students, controller.getFolder);
  router.patch('/folders/:folderId', students, requireCsrf, controller.updateFolder);
  router.delete('/folders/:folderId', students, requireCsrf, controller.archiveFolder);
  router.get('/folders/:folderId/resources', students, controller.listResources);
  router.post('/folders/:folderId/resources', students, requireCsrf, (req, res, next) => {
    const upload = createUpload(req.app.get('config'));
    upload.single('file')(req, res, next);
  }, controller.uploadResource);

  router.get('/resources/:resourceId', students, controller.getResource);
  router.get('/resources/:resourceId/download', students, controller.downloadResource);
  router.post('/resources/:resourceId/report', students, requireCsrf, controller.reportResource);

  router.get('/moderation/settings', admins, controller.moderationSettings);
  router.patch('/moderation/settings', admins, requireCsrf, controller.updateModerationSettings);
  router.get('/moderation/resources', admins, controller.moderationQueue);
  router.post('/moderation/resources/:resourceId/approve', admins, requireCsrf, controller.approveResource);
  router.post('/moderation/resources/:resourceId/reject', admins, requireCsrf, controller.rejectResource);
  router.post('/moderation/resources/:resourceId/remove', admins, requireCsrf, controller.removeResource);
  router.get('/moderation/reports', admins, controller.listReports);
  router.get('/moderation/reconciliation', admins, controller.reconciliation);
  router.patch('/moderation/reports/:reportId', admins, requireCsrf, controller.resolveReport);

  return router;
}
