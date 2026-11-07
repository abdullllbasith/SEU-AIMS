/**
 * Public API for the assessment module (CA-recovery attempts, Board records, absence claims).
 * All routes are behind ASSESSMENT_MARKS_ENABLED and answer 404 while it is off.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'assessment';
export const API_PREFIX = '/api/assessment';

export function createAssessmentModule() {
  return { id: MODULE_ID, apiPrefix: API_PREFIX, router: createRouter() };
}

export { createRouter };
export { AssessmentAttempt, BoardAuthorization, AbsenceClaim } from './models/index.js';
