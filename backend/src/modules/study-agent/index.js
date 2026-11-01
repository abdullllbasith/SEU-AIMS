/**
 * Public API for the study-agent module.
 * Other modules must import from this file only.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'study-agent';
export const API_PREFIX = '/api/study-agent';

export function createStudyAgentModule() {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
  };
}

export { createRouter };
export { StudySession, StudyMessage, DocumentIndex, DocumentChunk, AiUsage } from './models/index.js';
export { indexFile, enqueueIndexAfterScan } from './services/indexing.service.js';
export { syncUploadAfterScan } from './services/upload.service.js';
