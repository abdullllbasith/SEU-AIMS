import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import { ValidationError } from '../../../shared/errors/app-error.js';
import * as importService from '../services/import.service.js';
import * as studentResultsService from '../services/student-results.service.js';

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
      sendSuccess(res, await importService.listResultImports(req.principal, req.query));
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
    myResults: asyncHandler(async (req, res) => {
      sendSuccess(res, await studentResultsService.getOwnResults(req.principal, req.query));
    }),
  };
}
