/**
 * Public API for the notifications module.
 * Other modules must import from this file only.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'notifications';
export const API_PREFIX = '/api/notifications';

export function createNotificationsModule() {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
  };
}

export { createRouter };
export { Notification } from './models/notification.model.js';
