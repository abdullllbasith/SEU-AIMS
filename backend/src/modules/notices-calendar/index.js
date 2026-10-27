/**
 * Public API for the notices-calendar module.
 * Other modules must import from this file only.
 */
import { createCalendarRouter, createNoticesRouter, createRouter } from './routes/index.js';

export const MODULE_ID = 'notices-calendar';
export const API_PREFIX = '/api/notices';

export function createNoticesCalendarModule() {
  const noticesRouter = createNoticesRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router: noticesRouter,
    routes: [
      { prefix: '/api/notices', router: noticesRouter },
      { prefix: '/api/calendar', router: createCalendarRouter() },
    ],
  };
}

export { createRouter, createNoticesRouter, createCalendarRouter };
export { Notice } from './models/notice.model.js';
export { CalendarEvent } from './models/calendar-event.model.js';
export { evaluateCalendarReminder } from './services/calendar.service.js';
export { listNotices } from './services/notice.service.js';
export { upcomingEvents } from './services/calendar.service.js';
