import { ValidationError } from '../../../shared/errors/app-error.js';

/**
 * Server-side application transitions. Completing a CA never writes a grade.
 * SCHEDULED -> APPROVED is only reachable through syncApplicationStatusFromSubjects,
 * when the last scheduled subject exam notice is cancelled.
 */
export const APPLICATION_TRANSITIONS = Object.freeze({
  DRAFT: ['SUBMITTED', 'REJECTED'],
  SUBMITTED: ['UNDER_VERIFICATION', 'REJECTED', 'DRAFT'],
  UNDER_VERIFICATION: ['APPROVED', 'REJECTED'],
  REJECTED: ['DRAFT'],
  APPROVED: ['SCHEDULED', 'COMPLETED', 'RESOLVED'],
  SCHEDULED: ['APPROVED', 'COMPLETED', 'RESOLVED'],
  COMPLETED: ['RESOLVED'],
  RESOLVED: [],
});

export function assertApplicationTransition(fromStatus, toStatus) {
  const allowed = APPLICATION_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new ValidationError('This CA application status change is not allowed');
  }
}

/** Per subject exam transitions. RESOLVED is reachable from any state (official result). */
export const SUBJECT_EXAM_TRANSITIONS = Object.freeze({
  PENDING_APPROVAL: ['READY_TO_SCHEDULE', 'RESOLVED'],
  // READY_TO_SCHEDULE -> COMPLETED keeps the pre-existing rule that an approved subject may be completed
  // without a schedule; it still applies to one subject at a time.
  READY_TO_SCHEDULE: ['SCHEDULED', 'COMPLETED', 'RESOLVED'],
  SCHEDULED: ['SCHEDULED', 'READY_TO_SCHEDULE', 'COMPLETED', 'RESOLVED'],
  COMPLETED: ['RESOLVED'],
  RESOLVED: [],
});

export function assertSubjectExamTransition(fromStatus, toStatus) {
  const allowed = SUBJECT_EXAM_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new ValidationError('This subject exam status change is not allowed');
  }
}
