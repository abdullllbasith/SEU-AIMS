import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import { ValidationError } from '../../../shared/errors/app-error.js';
import { getDashboard } from '../services/dashboard.service.js';
import { listStudents, getStudentDetail } from '../services/student-overview.service.js';
import { listLecturers, getLecturerDetail } from '../services/lecturer-overview.service.js';
import { listOfferingHealth } from '../services/offering-health.service.js';
import { listResultImports, getResultImportMonitor } from '../services/result-monitor.service.js';
import { getCaOverview, listCaApplications } from '../services/ca-overview.service.js';
import {
  getNotificationHealth,
  getCalendarHealth,
  getStorageHealth,
  getJobs,
  retryFailedJob,
  getAudit,
  getDataQuality,
  getSecuritySignals,
} from '../services/ops-health.service.js';
import { exportStudentsCsv } from '../services/export.service.js';

export function createAdminController() {
  return {
    dashboard: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await getDashboard(req.principal, { infrastructure: req.app.get('infrastructure') }),
      );
    }),
    students: asyncHandler(async (req, res) => {
      sendSuccess(res, await listStudents(req.principal, req.query));
    }),
    studentDetail: asyncHandler(async (req, res) => {
      sendSuccess(res, await getStudentDetail(req.principal, req.params.userId));
    }),
    lecturers: asyncHandler(async (req, res) => {
      sendSuccess(res, await listLecturers(req.principal, req.query));
    }),
    lecturerDetail: asyncHandler(async (req, res) => {
      sendSuccess(res, await getLecturerDetail(req.principal, req.params.userId));
    }),
    offerings: asyncHandler(async (req, res) => {
      sendSuccess(res, await listOfferingHealth(req.principal, req.query));
    }),
    resultImports: asyncHandler(async (req, res) => {
      sendSuccess(res, await listResultImports(req.principal, req.query));
    }),
    resultImportDetail: asyncHandler(async (req, res) => {
      sendSuccess(res, await getResultImportMonitor(req.principal, req.params.importId));
    }),
    caOverview: asyncHandler(async (req, res) => {
      sendSuccess(res, await getCaOverview(req.principal));
    }),
    caApplications: asyncHandler(async (req, res) => {
      sendSuccess(res, await listCaApplications(req.principal, req.query));
    }),
    notificationHealth: asyncHandler(async (req, res) => {
      sendSuccess(res, await getNotificationHealth(req.principal, { config: req.app.get('config') }));
    }),
    calendarHealth: asyncHandler(async (req, res) => {
      sendSuccess(res, await getCalendarHealth(req.principal));
    }),
    storageHealth: asyncHandler(async (req, res) => {
      sendSuccess(res, await getStorageHealth(req.principal));
    }),
    jobs: asyncHandler(async (req, res) => {
      sendSuccess(res, await getJobs(req.principal, { infrastructure: req.app.get('infrastructure') }));
    }),
    retryJob: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await retryFailedJob(req.principal, req.params.jobId, { infrastructure: req.app.get('infrastructure') }),
      );
    }),
    audit: asyncHandler(async (req, res) => {
      sendSuccess(res, await getAudit(req.principal, req.query));
    }),
    dataQuality: asyncHandler(async (req, res) => {
      sendSuccess(res, await getDataQuality(req.principal));
    }),
    security: asyncHandler(async (req, res) => {
      sendSuccess(res, await getSecuritySignals(req.principal));
    }),
    exportStudents: asyncHandler(async (req, res) => {
      const file = await exportStudentsCsv(req.principal, req.query, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        actorUserId: req.principal.userId,
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.status(200).send(file.csv);
    }),
    rejectMutation: asyncHandler(async () => {
      throw new ValidationError('Admin analytics cannot mutate academic records');
    }),
    rejectJobForce: asyncHandler(async () => {
      throw new ValidationError('Force-success and generic job execution are not available');
    }),
  };
}
