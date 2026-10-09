import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import { ValidationError } from '../../../shared/errors/app-error.js';
import * as learningService from '../services/learning.service.js';

function deps(req) {
  return {
    config: req.app.get('config'),
    infrastructure: req.app.get('infrastructure') || {},
  };
}

export function createLearningController() {
  return {
    offerings: asyncHandler(async (req, res) => {
      sendSuccess(res, await learningService.listAccessibleOfferings(req.principal, req.query));
    }),
    offeringPage: asyncHandler(async (req, res) => {
      sendSuccess(res, await learningService.getOfferingLearningPage(req.principal, req.params.offeringId));
    }),
    listSections: asyncHandler(async (req, res) => {
      sendSuccess(res, await learningService.listSections(req.principal, req.params.offeringId));
    }),
    createSection: asyncHandler(async (req, res) => {
      sendSuccess(res, await learningService.createSection(req.principal, req.params.offeringId, req.body || {}), {
        statusCode: 201,
      });
    }),
    updateSection: asyncHandler(async (req, res) => {
      sendSuccess(res, await learningService.updateSection(req.principal, req.params.sectionId, req.body || {}));
    }),
    listResources: asyncHandler(async (req, res) => {
      sendSuccess(res, await learningService.listResources(req.principal, req.params.offeringId, req.query));
    }),
    createResource: asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new ValidationError('File is required');
      }
      sendSuccess(
        res,
        await learningService.createResource(req.principal, req.params.offeringId, req.body || {}, req.file, deps(req)),
        { statusCode: 201 },
      );
    }),
    getResource: asyncHandler(async (req, res) => {
      sendSuccess(res, await learningService.getResource(req.principal, req.params.resourceId));
    }),
    resourceVersions: asyncHandler(async (req, res) => {
      sendSuccess(res, await learningService.listResourceVersions(req.principal, req.params.resourceId));
    }),
    updateResource: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await learningService.updateResourceMetadata(req.principal, req.params.resourceId, req.body || {}),
      );
    }),
    publishResource: asyncHandler(async (req, res) => {
      sendSuccess(res, await learningService.publishResource(req.principal, req.params.resourceId));
    }),
    unpublishResource: asyncHandler(async (req, res) => {
      sendSuccess(res, await learningService.unpublishResource(req.principal, req.params.resourceId));
    }),
    replaceResource: asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new ValidationError('File is required');
      }
      sendSuccess(
        res,
        await learningService.replaceResourceFile(req.principal, req.params.resourceId, req.file, deps(req)),
      );
    }),
    archiveResource: asyncHandler(async (req, res) => {
      sendSuccess(res, await learningService.archiveResource(req.principal, req.params.resourceId));
    }),
    downloadResource: asyncHandler(async (req, res) => {
      const file = await learningService.downloadResource(req.principal, req.params.resourceId, deps(req));
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(file.displayFilename || 'resource')}"`,
      );
      res.send(file.body);
    }),
    adminResources: asyncHandler(async (req, res) => {
      sendSuccess(res, await learningService.listDepartmentResources(req.principal, req.query));
    }),
    reconciliation: asyncHandler(async (req, res) => {
      sendSuccess(res, await learningService.reconcileOfficialResources(req.principal));
    }),
  };
}
