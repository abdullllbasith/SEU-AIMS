/**
 * Public API for the notices-calendar module.
 * Other modules must import from this file only.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'notices-calendar';
export const API_PREFIX = '/api/notices';

export function createNoticesCalendarModule() {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
    routes: [
      { prefix: '/api/notices', router },
      { prefix: '/api/calendar', router: createRouter() },
    ],
  };
}

export { createRouter };
export { Notice } from './models/notice.model.js';
export { CalendarEvent } from './models/calendar-event.model.js';
