import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import { ValidationError } from '../../../shared/errors/app-error.js';
import * as importService from '../services/import.service.js';
import * as studentResultsService from '../services/student-results.service.js';
import * as operationsService from '../services/result-operations.service.js';

function deps(req) {
  return {
    config: req.app.get('config'),
    infrastructure: req.app.get('infrastructure') || {},
  };
}

export function createResultsController() {
  return {
    createImport: asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new ValidationError('File is required');
      }
      sendSuccess(res, await importService.createResultImport(req.principal, req.file, req.body || {}, deps(req)), {
        statusCode: 201,
      });
    }),
    listImports: asyncHandler(async (req, res) => {
      sendSuccess(res, await importService.listResultImports(req.principal, req.query, deps(req).infrastructure));
    }),
    getImport: asyncHandler(async (req, res) => {
      sendSuccess(res, await importService.getResultImport(req.principal, req.params.importId));
    }),
    previewImport: asyncHandler(async (req, res) => {
      sendSuccess(res, await importService.getResultImportPreview(req.principal, req.params.importId, req.query));
    }),
    commitImport: asyncHandler(async (req, res) => {
      sendSuccess(res, await importService.commitResultImport(req.principal, req.params.importId, deps(req)));
    }),
    rejectImport: asyncHandler(async (req, res) => {
      sendSuccess(res, await importService.rejectResultImport(req.principal, req.params.importId));
    }),
    reprocessImport: asyncHandler(async (req, res) => {
      sendSuccess(res, await importService.reprocessResultImport(req.principal, req.params.importId, deps(req)));
    }),
    searchRecords: asyncHandler(async (req, res) => {
      sendSuccess(res, await operationsService.searchOfficialResults(req.principal, req.query));
    }),
    resultVersions: asyncHandler(async (req, res) => {
      sendSuccess(res, await operationsService.getResultVersions(req.principal, req.params.resultId));
    }),
    analytics: asyncHandler(async (req, res) => {
      sendSuccess(res, await operationsService.getResultAnalytics(req.principal));
    }),
    reconciliation: asyncHandler(async (req, res) => {
      sendSuccess(res, await operationsService.reconcileResults(req.principal));
    }),
    myResults: asyncHandler(async (req, res) => {
      sendSuccess(res, await studentResultsService.getOwnResults(req.principal, req.query));
    }),
  };
}
