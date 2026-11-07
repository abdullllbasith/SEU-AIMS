import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import * as attemptService from '../services/attempt.service.js';
import * as adminService from '../services/admin-attempt.service.js';

function infra(req) {
  return req.app.get('infrastructure') || {};
}

export function createAssessmentController() {
  return {
    openAttempt: asyncHandler(async (req, res) => {
      sendSuccess(res, await attemptService.openAttempt(req.principal, { linkId: req.params.linkId }), { statusCode: 201 });
    }),
    saveMarks: asyncHandler(async (req, res) => {
      sendSuccess(res, await attemptService.saveMarks(req.principal, req.params.attemptId, req.body || {}));
    }),
    submitAttempt: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await attemptService.submitAttempt(req.principal, req.params.attemptId, { infrastructure: infra(req) }),
      );
    }),
    listLecturerAttempts: asyncHandler(async (req, res) => {
      sendSuccess(res, await attemptService.listLecturerAttempts(req.principal, req.query));
    }),
    listAdminAttempts: asyncHandler(async (req, res) => {
      sendSuccess(res, await adminService.listAdminAttempts(req.principal, req.query));
    }),
    verifyAttempt: asyncHandler(async (req, res) => {
      sendSuccess(res, await adminService.verifyAttempt(req.principal, req.params.attemptId, req.body || {}));
    }),
    correctMarks: asyncHandler(async (req, res) => {
      sendSuccess(res, await adminService.correctAttemptMarks(req.principal, req.params.attemptId, req.body || {}));
    }),
    returnAttempt: asyncHandler(async (req, res) => {
      sendSuccess(res, await adminService.returnAttempt(req.principal, req.params.attemptId, req.body || {}));
    }),
    recordBoardAuthorization: asyncHandler(async (req, res) => {
      sendSuccess(res, await adminService.recordBoardAuthorization(req.principal, req.params.attemptId, req.body || {}), {
        statusCode: 201,
      });
    }),
    publishAttempt: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await adminService.publishAttempt(req.principal, req.params.attemptId, req.body || {}, { infrastructure: infra(req) }),
      );
    }),
    recordAbsentAttempt: asyncHandler(async (req, res) => {
      sendSuccess(res, await adminService.recordAbsentAttempt(req.principal, req.params.linkId), { statusCode: 201 });
    }),
    recordAbsenceClaim: asyncHandler(async (req, res) => {
      sendSuccess(res, await adminService.recordAbsenceClaim(req.principal, req.params.attemptId, req.body || {}), {
        statusCode: 201,
      });
    }),
    decideAbsenceClaim: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await adminService.decideAbsenceClaim(req.principal, req.params.attemptId, req.params.claimId, req.body || {}),
      );
    }),
  };
}
