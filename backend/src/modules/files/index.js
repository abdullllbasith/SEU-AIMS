/**
 * Public API for the files module.
 * Other modules must import from this file only.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'files';
export const API_PREFIX = '/api/files';

export function createFilesModule() {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
  };
}

export { createRouter };
export { StoredFile } from './models/stored-file.model.js';
