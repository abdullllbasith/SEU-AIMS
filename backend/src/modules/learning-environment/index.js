/**
 * Public API for the learning-environment module.
 * Other modules must import from this file only.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'learning-environment';
export const API_PREFIX = '/api/learning';

export function createLearningEnvironmentModule() {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
  };
}

export { createRouter };
export { OfficialResource } from './models/official-resource.model.js';
