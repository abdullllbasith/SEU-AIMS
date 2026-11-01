import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import * as accessService from '../services/access.service.js';
import * as subjectService from '../services/subject-context.service.js';
import * as sessionService from '../services/session.service.js';
import * as tutorService from '../services/tutor.service.js';
import * as uploadService from '../services/upload.service.js';

function deps(req) {
  return {
    config: req.app.get('config'),
    infrastructure: req.app.get('infrastructure') || {},
  };
}

export function createStudyAgentController() {
  return {
    access: asyncHandler(async (req, res) => {
      sendSuccess(res, await accessService.getAccess(req.principal));
    }),
    subjects: asyncHandler(async (req, res) => {
      sendSuccess(res, { items: await subjectService.listSubjects(req.principal) });
    }),
    listSessions: asyncHandler(async (req, res) => {
      sendSuccess(res, await sessionService.listSessions(req.principal, req.query || {}));
    }),
    createSession: asyncHandler(async (req, res) => {
      sendSuccess(res, await sessionService.createSession(req.principal, req.body || {}), { statusCode: 201 });
    }),
    getSession: asyncHandler(async (req, res) => {
      sendSuccess(res, await sessionService.getSession(req.principal, req.params.sessionId, req.query || {}));
    }),
    renameSession: asyncHandler(async (req, res) => {
      sendSuccess(res, await sessionService.renameSession(req.principal, req.params.sessionId, req.body || {}));
    }),
    archiveSession: asyncHandler(async (req, res) => {
      sendSuccess(res, await sessionService.archiveSession(req.principal, req.params.sessionId));
    }),
    sendMessage: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await tutorService.sendMessage(req.principal, req.params.sessionId, req.body || {}, deps(req)),
        { statusCode: 201 },
      );
    }),
    uploadAttachments: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await uploadService.uploadAttachments(req.principal, req.params.sessionId, req.files, deps(req)),
        { statusCode: 201 },
      );
    }),
    attachmentStatus: asyncHandler(async (req, res) => {
      sendSuccess(res, await uploadService.getAttachmentStatus(req.principal, req.params.fileId));
    }),
    removeAttachment: asyncHandler(async (req, res) => {
      sendSuccess(res, await uploadService.removeAttachment(req.principal, req.params.fileId));
    }),
    attachmentContent: asyncHandler(async (req, res) => {
      const file = await uploadService.loadAttachmentContent(req.principal, req.params.fileId, deps(req));
      const isImage = file.mimeType.startsWith('image/');
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader(
        'Content-Disposition',
        `${isImage ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.name || 'attachment')}"`,
      );
      res.send(file.body);
    }),
    sessionSources: asyncHandler(async (req, res) => {
      sendSuccess(res, await tutorService.listSessionSources(req.principal, req.params.sessionId));
    }),
  };
}
