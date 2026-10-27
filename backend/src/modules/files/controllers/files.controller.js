import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import { reconcileStoredFiles } from '../services/reconciliation.service.js';

export function createFilesController() {
  return {
    reconciliation: asyncHandler(async (req, res) => {
      const infrastructure = req.app.get('infrastructure') || {};
      sendSuccess(res, await reconcileStoredFiles(req.principal, { storage: infrastructure.storage }));
    }),
  };
}
