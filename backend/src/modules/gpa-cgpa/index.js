/**
 * Public API for the gpa-cgpa module.
 * Other modules must import from this file only.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'gpa-cgpa';
export const API_PREFIX = '/api/gpa';

export function createGpaCgpaModule() {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
  };
}

export { createRouter };
export { GpaSnapshot } from './models/gpa-snapshot.model.js';
export { recalculateStudentGpa, getStudentGpaSummary } from './services/gpa.service.js';
