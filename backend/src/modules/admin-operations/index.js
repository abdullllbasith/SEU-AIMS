/**
 * Public API for the admin-operations module.
 * Derived operational reads for Department Administrators. Source domains remain authoritative.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'admin-operations';
export const API_PREFIX = '/api/admin';

export function createAdminOperationsModule() {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
  };
}

export { createRouter };
export { KPI_CATALOG } from './constants.js';
export { getDashboard } from './services/dashboard.service.js';
export { listStudents } from './services/student-overview.service.js';
export { listLecturers } from './services/lecturer-overview.service.js';
export { listOfferingHealth } from './services/offering-health.service.js';
export { listResultImports } from './services/result-monitor.service.js';
export { getCaOverview } from './services/ca-overview.service.js';
export {
  getNotificationHealth,
  getJobs,
  getAudit,
  getDataQuality,
  getSecuritySignals,
} from './services/ops-health.service.js';
export { sanitizeSearch } from './services/scope.js';
