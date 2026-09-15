/**
 * Public API for the learning-environment module.
 * Other modules must import from this file only.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'learning-environment';
export const API_PREFIX = '/api/learning';

export function createLearningEnvironmentModule(_deps = {}) {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
  };
}

export { createRouter };
export { OfficialResource, ResourceSection } from './models/index.js';
export { RESOURCE_CATEGORIES, PUBLICATION_STATES } from './constants.js';
export { listAccessibleOfferings, listResources } from './services/learning.service.js';
