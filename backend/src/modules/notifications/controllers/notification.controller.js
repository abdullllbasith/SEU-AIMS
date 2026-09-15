import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import * as inbox from '../services/inbox.service.js';
import * as preference from '../services/preference.service.js';
import { requireDepartmentAdmin } from '../../../shared/auth/authorize.js';

export function createNotificationController() {
  return {
    list: asyncHandler(async (req, res) => {
      sendSuccess(res, await inbox.listInbox(req.principal, req.query));
    }),
    unread: asyncHandler(async (req, res) => {
      sendSuccess(res, await inbox.unreadCount(req.principal));
    }),
    markRead: asyncHandler(async (req, res) => {
      sendSuccess(res, await inbox.markRead(req.principal, req.params.notificationId));
    }),
    markAllRead: asyncHandler(async (req, res) => {
      sendSuccess(res, await inbox.markAllRead(req.principal));
    }),
    getPreferences: asyncHandler(async (req, res) => {
      sendSuccess(res, await preference.getPreferences(req.principal));
    }),
    patchPreferences: asyncHandler(async (req, res) => {
      sendSuccess(res, await preference.updatePreferences(req.principal, req.body || {}));
    }),
    adminSummary: asyncHandler(async (req, res) => {
      sendSuccess(res, await inbox.adminSummary(req.principal));
    }),
    requireDepartmentAdmin,
  };
}
