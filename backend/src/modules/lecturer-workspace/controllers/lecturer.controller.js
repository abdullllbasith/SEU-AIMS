import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import * as dashboardService from '../services/dashboard.service.js';
import { searchLecturerWorkspace } from '../services/search.service.js';

function privateNoStore(res) {
  res.setHeader('Cache-Control', 'private, no-store');
}

export function createLecturerWorkspaceController() {
  return {
    dashboard: asyncHandler(async (req, res) => {
      privateNoStore(res);
      sendSuccess(res, await dashboardService.getLecturerDashboard(req.principal, { refresh: req.query.refresh === 'true' }));
    }),
    offerings: asyncHandler(async (req, res) => {
      privateNoStore(res);
      sendSuccess(res, await dashboardService.getAssignedOfferings(req.principal));
    }),
    offering: asyncHandler(async (req, res) => {
      privateNoStore(res);
      sendSuccess(res, await dashboardService.getOfferingWorkspace(req.principal, req.params.offeringId, req.query));
    }),
    upcoming: asyncHandler(async (req, res) => {
      privateNoStore(res);
      sendSuccess(res, await dashboardService.getUpcoming(req.principal));
    }),
    search: asyncHandler(async (req, res) => {
      privateNoStore(res);
      sendSuccess(res, await searchLecturerWorkspace(req.principal, req.query));
    }),
    assignments: asyncHandler(async (req, res) => {
      privateNoStore(res);
      sendSuccess(res, await dashboardService.getAssignments(req.principal));
    }),
    caEligible: asyncHandler(async (req, res) => {
      privateNoStore(res);
      sendSuccess(res, await dashboardService.getCaEligible(req.principal));
    }),
    caSchedules: asyncHandler(async (req, res) => {
      privateNoStore(res);
      sendSuccess(res, await dashboardService.getCaSchedules(req.principal));
    }),
    rejectCaApprove: asyncHandler(async () => {
      dashboardService.rejectLecturerMutation('caApprove');
    }),
    rejectResults: asyncHandler(async () => {
      dashboardService.rejectLecturerMutation('results');
    }),
    rejectAssignmentWrite: asyncHandler(async () => {
      dashboardService.rejectLecturerMutation('assignmentsWrite');
    }),
    rejectResourceWrite: asyncHandler(async () => {
      dashboardService.rejectLecturerMutation('resourcesWrite');
    }),
  };
}
