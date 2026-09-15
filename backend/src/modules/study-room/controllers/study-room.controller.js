import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import { ValidationError } from '../../../shared/errors/app-error.js';
import * as accessService from '../services/access.service.js';
import * as chatService from '../services/chat.service.js';
import * as directoryService from '../services/directory.service.js';
import * as resourceService from '../services/resource.service.js';
import * as moderationService from '../services/moderation.service.js';

function deps(req) {
  return {
    config: req.app.get('config'),
    infrastructure: req.app.get('infrastructure') || {},
  };
}

export function createStudyRoomController() {
  return {
    access: asyncHandler(async (req, res) => {
      sendSuccess(res, await chatService.getAccess(req.principal));
    }),
    conversations: asyncHandler(async (req, res) => {
      sendSuccess(res, await chatService.listConversations(req.principal));
    }),
    createConversation: asyncHandler(async (req, res) => {
      sendSuccess(res, await chatService.createPrivateConversation(req.principal, req.body || {}, deps(req)), {
        statusCode: 201,
      });
    }),
    getConversation: asyncHandler(async (req, res) => {
      sendSuccess(res, await chatService.getConversation(req.principal, req.params.conversationId));
    }),
    putEnvelopes: asyncHandler(async (req, res) => {
      sendSuccess(res, await chatService.putKeyEnvelopes(req.principal, req.params.conversationId, req.body || {}));
    }),
    listMessages: asyncHandler(async (req, res) => {
      sendSuccess(res, await chatService.listMessages(req.principal, req.params.conversationId, req.query, deps(req)));
    }),
    sendMessage: asyncHandler(async (req, res) => {
      sendSuccess(res, await chatService.sendMessage(req.principal, req.params.conversationId, req.body || {}, deps(req)), {
        statusCode: 201,
      });
    }),
    markRead: asyncHandler(async (req, res) => {
      sendSuccess(res, await chatService.markRead(req.principal, req.params.conversationId, req.body || {}));
    }),
    deleteMessage: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await chatService.tombstoneMessage(req.principal, req.params.conversationId, req.params.messageId),
      );
    }),
    editMessage: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await chatService.editMessage(
          req.principal,
          req.params.conversationId,
          req.params.messageId,
          req.body || {},
          deps(req),
        ),
      );
    }),
    upsertKey: asyncHandler(async (req, res) => {
      sendSuccess(res, await directoryService.upsertPublicKey(req.principal, req.body || {}, deps(req)));
    }),
    getPublicKey: asyncHandler(async (req, res) => {
      sendSuccess(res, await directoryService.getPublicKey(req.principal, req.params.userId, deps(req)));
    }),
    searchStudents: asyncHandler(async (req, res) => {
      sendSuccess(res, await directoryService.searchStudents(req.principal, req.query, deps(req)));
    }),
    listFolders: asyncHandler(async (req, res) => {
      sendSuccess(res, await resourceService.listFolders(req.principal, req.query));
    }),
    createFolder: asyncHandler(async (req, res) => {
      sendSuccess(res, await resourceService.createFolder(req.principal, req.body || {}), { statusCode: 201 });
    }),
    getFolder: asyncHandler(async (req, res) => {
      sendSuccess(res, await resourceService.getFolder(req.principal, req.params.folderId));
    }),
    updateFolder: asyncHandler(async (req, res) => {
      sendSuccess(res, await resourceService.updateFolder(req.principal, req.params.folderId, req.body || {}));
    }),
    archiveFolder: asyncHandler(async (req, res) => {
      sendSuccess(res, await resourceService.archiveFolder(req.principal, req.params.folderId));
    }),
    listResources: asyncHandler(async (req, res) => {
      sendSuccess(res, await resourceService.listResources(req.principal, req.params.folderId, req.query));
    }),
    uploadResource: asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new ValidationError('File is required');
      }
      sendSuccess(
        res,
        await resourceService.uploadResource(req.principal, req.params.folderId, req.body || {}, req.file, deps(req)),
        { statusCode: 201 },
      );
    }),
    getResource: asyncHandler(async (req, res) => {
      sendSuccess(res, await resourceService.getResource(req.principal, req.params.resourceId));
    }),
    downloadResource: asyncHandler(async (req, res) => {
      const file = await resourceService.downloadResource(req.principal, req.params.resourceId, deps(req));
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(file.displayFilename || 'resource')}"`,
      );
      res.send(file.body);
    }),
    reportResource: asyncHandler(async (req, res) => {
      sendSuccess(res, await resourceService.reportTarget(req.principal, req.params.resourceId, req.body || {}), {
        statusCode: 201,
      });
    }),
    moderationSettings: asyncHandler(async (req, res) => {
      sendSuccess(res, await moderationService.getModerationSettings(req.principal));
    }),
    updateModerationSettings: asyncHandler(async (req, res) => {
      sendSuccess(res, await moderationService.updateModerationSettings(req.principal, req.body || {}));
    }),
    moderationQueue: asyncHandler(async (req, res) => {
      sendSuccess(res, await moderationService.listModerationQueue(req.principal, req.query));
    }),
    approveResource: asyncHandler(async (req, res) => {
      sendSuccess(res, await moderationService.approveResource(req.principal, req.params.resourceId));
    }),
    rejectResource: asyncHandler(async (req, res) => {
      sendSuccess(res, await moderationService.rejectResource(req.principal, req.params.resourceId));
    }),
    removeResource: asyncHandler(async (req, res) => {
      sendSuccess(res, await moderationService.removeResource(req.principal, req.params.resourceId));
    }),
    listReports: asyncHandler(async (req, res) => {
      sendSuccess(res, await moderationService.listReports(req.principal, req.query));
    }),
    resolveReport: asyncHandler(async (req, res) => {
      sendSuccess(res, await moderationService.resolveReport(req.principal, req.params.reportId, req.body || {}));
    }),
  };
}

export { accessService };
