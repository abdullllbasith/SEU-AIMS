import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import { ValidationError } from '../../../shared/errors/app-error.js';
import * as profileService from '../services/profile.service.js';
import * as experienceService from '../services/experience.service.js';

function deps(req) {
  return req.app.get('infrastructure') || {};
}

export function createStudentExperienceController() {
  return {
    profile: asyncHandler(async (req, res) => {
      sendSuccess(res, await profileService.getOwnProfile(req.principal));
    }),
    updateProfile: asyncHandler(async (req, res) => {
      sendSuccess(res, await profileService.updateOwnProfile(req.principal, req.body || {}));
    }),
    uploadPhoto: asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new ValidationError('File is required');
      }
      sendSuccess(res, await profileService.uploadOwnProfileImage(req.principal, req.file, deps(req)));
    }),
    downloadPhoto: asyncHandler(async (req, res) => {
      const { file, body } = await profileService.downloadOwnProfileImage(req.principal, deps(req));
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).end(body);
    }),
    academicContext: asyncHandler(async (req, res) => {
      sendSuccess(res, await experienceService.getAcademicHistory(req.principal, { ...req.query, semesterId: undefined }));
    }),
    academicHistory: asyncHandler(async (req, res) => {
      sendSuccess(res, await experienceService.getAcademicHistory(req.principal, req.query));
    }),
    performance: asyncHandler(async (req, res) => {
      sendSuccess(res, await experienceService.getPerformance(req.principal, req.query));
    }),
    dashboard: asyncHandler(async (req, res) => {
      sendSuccess(res, await experienceService.getStudentDashboard(req.principal, { refresh: req.query.refresh === 'true' }));
    }),
    upcoming: asyncHandler(async (req, res) => {
      sendSuccess(res, await experienceService.getUpcoming(req.principal));
    }),
    search: asyncHandler(async (req, res) => {
      sendSuccess(res, await experienceService.searchStudentWorkspace(req.principal, req.query));
    }),
  };
}
