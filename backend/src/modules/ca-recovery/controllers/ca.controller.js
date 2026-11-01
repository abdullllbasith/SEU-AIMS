import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import * as applicationService from '../services/application.service.js';
import * as windowService from '../services/window.service.js';
import * as scheduleService from '../services/schedule.service.js';
import * as examNoticeService from '../services/exam-notice.service.js';
import { downloadApplicationPdf } from '../services/pdf.service.js';
import * as reconciliationService from '../services/reconciliation.service.js';
import * as recoveryReviewService from '../services/recovery-result-review.service.js';

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
    preview: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.previewApplicationForm(req.principal, req.query));
    }),
    createApplication: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.createDraft(req.principal, req.body || {}), { statusCode: 201 });
    }),
    listMine: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.listOwnApplications(req.principal));
    }),
    getMine: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.getApplication(req.principal, req.params.applicationId, deps(req)));
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
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
      res.send(file.buffer);
    }),
    adminWindows: asyncHandler(async (req, res) => {
      sendSuccess(res, await windowService.listWindows(req.principal, req.query));
    }),
    saveWindow: asyncHandler(async (req, res) => {
      sendSuccess(res, await windowService.createOrUpdateWindow(req.principal, req.body || {}, deps(req)), { statusCode: 201 });
    }),
    deleteWindow: asyncHandler(async (req, res) => {
      sendSuccess(res, await windowService.deleteWindow(req.principal, req.params.windowId));
    }),
    adminList: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.adminListApplications(req.principal, req.query));
    }),
    adminGet: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.getApplication(req.principal, req.params.applicationId, deps(req)));
    }),
    confirmReceipt: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.confirmPhysicalReceipt(req.principal, req.params.applicationId, req.body || {}));
    }),
    verifyPhysical: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.verifyPhysical(req.principal, req.params.applicationId, req.body || {}));
    }),
    approve: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.approveApplication(req.principal, req.params.applicationId, deps(req)));
    }),
    reject: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.rejectApplication(req.principal, req.params.applicationId, req.body || {}, deps(req)));
    }),
    reconciliation: asyncHandler(async (req, res) => {
      sendSuccess(res, await reconciliationService.reconcileCaConditions(req.principal));
    }),
    unresolvedConditions: asyncHandler(async (req, res) => {
      sendSuccess(res, await reconciliationService.listUnresolvedEcaConditions(req.principal));
    }),
    backfill: asyncHandler(async (req, res) => {
      sendSuccess(res, await reconciliationService.backfillMissingCaConditions(req.principal));
    }),
    reopen: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.reopenApplication(req.principal, req.params.applicationId, req.body || {}, deps(req)));
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
      sendSuccess(res, await scheduleService.completeApplication(req.principal, req.params.applicationId, req.body || {}));
    }),
    scanVerify: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.scanVerify(req.principal, req.body || {}));
    }),
    listExamNotices: asyncHandler(async (req, res) => {
      sendSuccess(res, await examNoticeService.listExamNotices(req.principal));
    }),
    publishExamNotice: asyncHandler(async (req, res) => {
      sendSuccess(res, await examNoticeService.publishExamNotice(req.principal, req.body || {}, deps(req)), {
        statusCode: 201,
      });
    }),
    rescheduleExamNotice: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await examNoticeService.rescheduleExamNotice(req.principal, req.params.noticeId, req.body || {}, deps(req)),
      );
    }),
    cancelExamNotice: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await examNoticeService.cancelExamNotice(req.principal, req.params.noticeId, req.body || {}, deps(req)),
      );
    }),
    attachToExamNotice: asyncHandler(async (req, res) => {
      sendSuccess(res, await examNoticeService.attachEligibleToNotice(req.principal, req.params.noticeId, deps(req)));
    }),
    examNoticeDelivery: asyncHandler(async (req, res) => {
      sendSuccess(res, await examNoticeService.examNoticeDelivery(req.principal, req.params.noticeId));
    }),
    markAttendance: asyncHandler(async (req, res) => {
      sendSuccess(res, await examNoticeService.markAttendance(req.principal, req.params.noticeId, req.body || {}));
    }),
    confirmNoticeCompletion: asyncHandler(async (req, res) => {
      sendSuccess(res, await examNoticeService.confirmNoticeCompletion(req.principal, req.params.noticeId, deps(req)));
    }),
    completeSubject: asyncHandler(async (req, res) => {
      sendSuccess(res, await examNoticeService.completeSubject(req.principal, { linkId: req.params.linkId }));
    }),
    listRecoveryReviews: asyncHandler(async (req, res) => {
      sendSuccess(res, await recoveryReviewService.listRecoveryResultReviews(req.principal));
    }),
    decideRecoveryReview: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await recoveryReviewService.decideRecoveryResultReview(
          req.principal,
          req.params.reviewId,
          req.body || {},
        ),
      );
    }),
    verifyToken: asyncHandler(async (req, res) => {
      sendSuccess(res, await applicationService.verifyByToken(req.params.token));
    }),
  };
}
