/**
 * Public API for the ca-recovery module.
 * Other modules must import from this file only.
 */
import { createRouter } from './routes/index.js';
import { registerNotificationGuard } from '../notifications/index.js';
import { caNotificationGuard } from './services/exam-notice.guard.js';

// A CA exam message is only sent while its notice generation is still the live schedule for that subject.
registerNotificationGuard('ca-recovery', caNotificationGuard);

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
export { CaApplicationWindow } from './models/ca-application-window.model.js';
export { IncompleteCa } from './models/incomplete-ca.model.js';
export { CaApplication } from './models/ca-application.model.js';
export { CaApplicationSubject } from './models/ca-application-subject.model.js';
export { CaApplicationEvent } from './models/ca-application-event.model.js';
export { CaSchedule } from './models/ca-schedule.model.js';
export { createPublicApplicationId, createQrVerificationToken } from './public-ids.js';
export { syncIncompleteCaFromResult } from './services/eca-from-results.js';
export {
  decideRecoveryResultReview,
  findPendingRecoveryReview,
  listRecoveryResultReviews,
  submitPendingCaRecovery,
} from './services/recovery-result-review.service.js';
export { processEcaDetectJob } from './services/eca-detect.service.js';
export { generateApplicationPdf } from './services/pdf.service.js';
export { CaExamNotice } from './models/ca-exam-notice.model.js';
export { requireManagedOffering } from './services/exam-notice.service.js';
export { recordCaAudit } from './services/notify.js';
export { listOwnApplications, listEligibleConditions } from './services/application.service.js';
export { listApprovedForLecturer, listSchedules } from './services/schedule.service.js';
export { syncApplicationStatusFromSubjects, deriveApplicationStatus } from './services/application-status.service.js';
export { windowLifecycle } from './utils/http.js';
