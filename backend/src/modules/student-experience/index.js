/**
 * Public API for the student-experience module.
 * Other modules must import from this file only.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'student-experience';
export const API_PREFIX = '/api/me';

export function createStudentExperienceModule() {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
  };
}

export { createRouter };
export { presentGpaSummary } from './utils/gpa-presentation.js';
export { normalizePhone } from './utils/phone.js';
export { buildAttentionItems, groupUpcomingEvents, sanitizeWorkspaceSearch } from './services/workspace.js';
