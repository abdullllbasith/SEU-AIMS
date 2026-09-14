/**
 * Public API for the ca-recovery module.
 * Other modules must import from this file only.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'ca-recovery';
export const API_PREFIX = '/api/ca';

export function createCaRecoveryModule() {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
  };
}

export { createRouter };
export { IncompleteCa } from './models/incomplete-ca.model.js';
export { CaApplication } from './models/ca-application.model.js';
export { CaApplicationSubject } from './models/ca-application-subject.model.js';
export { CaApplicationEvent } from './models/ca-application-event.model.js';
export { CaSchedule } from './models/ca-schedule.model.js';
export { createPublicApplicationId, createQrVerificationToken } from './public-ids.js';
