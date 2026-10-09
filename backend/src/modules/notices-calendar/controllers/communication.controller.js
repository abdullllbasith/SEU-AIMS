import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import * as noticeService from '../services/notice.service.js';
import * as calendarService from '../services/calendar.service.js';
import * as reconciliationService from '../services/communication-reconciliation.service.js';

function deps(req) {
  return {
    config: req.app.get('config'),
    infrastructure: req.app.get('infrastructure') || {},
  };
}

export function createNoticeController() {
  return {
    list: asyncHandler(async (req, res) => {
      sendSuccess(res, await noticeService.listNotices(req.principal, req.query));
    }),
    get: asyncHandler(async (req, res) => {
      sendSuccess(res, await noticeService.getNotice(req.principal, req.params.noticeId));
    }),
    create: asyncHandler(async (req, res) => {
      sendSuccess(res, await noticeService.createNotice(req.principal, req.body || {}), { statusCode: 201 });
    }),
    update: asyncHandler(async (req, res) => {
      sendSuccess(res, await noticeService.updateNotice(req.principal, req.params.noticeId, req.body || {}));
    }),
    publish: asyncHandler(async (req, res) => {
      sendSuccess(res, await noticeService.publishNotice(req.principal, req.params.noticeId, deps(req)));
    }),
    archive: asyncHandler(async (req, res) => {
      sendSuccess(res, await noticeService.archiveNotice(req.principal, req.params.noticeId));
    }),
  };
}

export function createCalendarController() {
  return {
    list: asyncHandler(async (req, res) => {
      sendSuccess(res, await calendarService.listEvents(req.principal, req.query));
    }),
    reconciliation: asyncHandler(async (req, res) => {
      sendSuccess(res, await reconciliationService.reconcileCommunication(req.principal));
    }),
    upcoming: asyncHandler(async (req, res) => {
      sendSuccess(res, await calendarService.upcomingEvents(req.principal));
    }),
    get: asyncHandler(async (req, res) => {
      sendSuccess(res, await calendarService.getEvent(req.principal, req.params.eventId));
    }),
    adminCreate: asyncHandler(async (req, res) => {
      sendSuccess(res, await calendarService.createAdminEvent(req.principal, req.body || {}, deps(req)), {
        statusCode: 201,
      });
    }),
    lecturerCreate: asyncHandler(async (req, res) => {
      sendSuccess(res, await calendarService.createLecturerEvent(req.principal, req.body || {}, deps(req)), {
        statusCode: 201,
      });
    }),
    update: asyncHandler(async (req, res) => {
      sendSuccess(res, await calendarService.updateEvent(req.principal, req.params.eventId, req.body || {}, deps(req)));
    }),
    publish: asyncHandler(async (req, res) => {
      sendSuccess(res, await calendarService.publishEvent(req.principal, req.params.eventId));
    }),
    cancel: asyncHandler(async (req, res) => {
      sendSuccess(res, await calendarService.cancelEvent(req.principal, req.params.eventId));
    }),
  };
}
