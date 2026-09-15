import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import * as applicationService from '../services/application.service.js';
import * as windowService from '../services/window.service.js';
import * as scheduleService from '../services/schedule.service.js';
import { downloadApplicationPdf } from '../services/pdf.service.js';

function deps(req) {
  return {
    config: req.app.get('config'),
    infrastructure: req.app.get('infrastructure') || {},
  };
}

export function createCaController() {
  return {
    conditions: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.listEligibleConditions(req.principal, req.query));
    }),
    windowsMe: asyncHandler(async (req, res) => {
      sendSuccess(res, await windowService.getOpenWindowForStudent(req.principal, req.query));
    }),
    createApplication: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.createDraft(req.principal, req.body || {}), { statusCode: 201 });
    }),
    listMine: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.listOwnApplications(req.principal));
    }),
    getMine: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.getApplication(req.principal, req.params.applicationId));
    }),
    patchMine: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.updateDraft(req.principal, req.params.applicationId, req.body || {}));
    }),
    submitMine: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.submitApplication(req.principal, req.params.applicationId, deps(req)));
    }),
    pdfMine: asyncHandler(async (req, res) => {
      const file = await downloadApplicationPdf(req.principal, req.params.applicationId, deps(req));
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
      res.send(file.buffer);
    }),
    adminWindows: asyncHandler(async (req, res) => {
      sendSuccess(res, await windowService.listWindows(req.principal, req.query));
    }),
    saveWindow: asyncHandler(async (req, res) => {
      sendSuccess(res, await windowService.createOrUpdateWindow(req.principal, req.body || {}), { statusCode: 201 });
    }),
    adminList: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.adminListApplications(req.principal, req.query));
    }),
    adminGet: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.getApplication(req.principal, req.params.applicationId));
    }),
    verifyPhysical: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.verifyPhysical(req.principal, req.params.applicationId, req.body || {}));
    }),
    approve: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.approveApplication(req.principal, req.params.applicationId));
    }),
    reject: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.rejectApplication(req.principal, req.params.applicationId, req.body || {}));
    }),
    reopen: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.reopenApplication(req.principal, req.params.applicationId, req.body || {}));
    }),
    lecturerEligible: asyncHandler(async (req, res) => {
      sendSuccess(res, await scheduleService.listApprovedForLecturer(req.principal));
    }),
    lecturerSchedules: asyncHandler(async (req, res) => {
      sendSuccess(res, await scheduleService.listSchedules(req.principal));
    }),
    createSchedule: asyncHandler(async (req, res) => {
      sendSuccess(res, await scheduleService.createSchedule(req.principal, req.body || {}, deps(req)), {
        statusCode: 201,
      });
    }),
    cancelSchedule: asyncHandler(async (req, res) => {
      sendSuccess(res, await scheduleService.cancelSchedule(req.principal, req.params.scheduleId));
    }),
    complete: asyncHandler(async (req, res) => {
      sendSuccess(res, await scheduleService.completeApplication(req.principal, req.params.applicationId));
    }),
    verifyToken: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.verifyByToken(req.params.token));
    }),
  };
}
