/**
 * Public API for the lecturer-workspace module.
 * Assignment-scoped teaching composition. Source domains remain authoritative.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'lecturer-workspace';
export const API_PREFIX = '/api/lecturer';

export function createLecturerWorkspaceModule() {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
  };
}

export { createRouter };
export { TEACHING_SUMMARY_CATALOG } from './constants.js';
export { getLecturerDashboard } from './services/dashboard.service.js';
export { sanitizeWorkspaceSearch } from './services/scope.js';
export { dashboardCacheKey } from './services/dashboard-cache.js';
