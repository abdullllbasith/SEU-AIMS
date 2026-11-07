import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import * as attemptService from '../services/attempt.service.js';

export function createAssessmentController() {
  return {
    openAttempt: asyncHandler(async (req, res) => {
      sendSuccess(res, await attemptService.openAttempt(req.principal, { linkId: req.params.linkId }), { statusCode: 201 });
    }),
    saveMarks: asyncHandler(async (req, res) => {
      sendSuccess(res, await attemptService.saveMarks(req.principal, req.params.attemptId, req.body || {}));
    }),
    submitAttempt: asyncHandler(async (req, res) => {
      sendSuccess(res, await attemptService.submitAttempt(req.principal, req.params.attemptId));
    }),
    listLecturerAttempts: asyncHandler(async (req, res) => {
      sendSuccess(res, await attemptService.listLecturerAttempts(req.principal, req.query));
    }),
  };
}
