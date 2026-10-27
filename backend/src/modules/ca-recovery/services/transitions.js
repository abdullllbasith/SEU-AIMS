import { ValidationError } from '../../../shared/errors/app-error.js';

/** Server-side application transitions. Completing a CA never writes a grade. */
export const APPLICATION_TRANSITIONS = Object.freeze({
  DRAFT: ['SUBMITTED', 'REJECTED'],
  SUBMITTED: ['UNDER_VERIFICATION', 'REJECTED', 'DRAFT'],
  UNDER_VERIFICATION: ['APPROVED', 'REJECTED'],
  REJECTED: ['DRAFT'],
  APPROVED: ['SCHEDULED', 'COMPLETED', 'RESOLVED'],
  SCHEDULED: ['COMPLETED', 'RESOLVED'],
  COMPLETED: ['RESOLVED'],
  RESOLVED: [],
});

export function assertApplicationTransition(fromStatus, toStatus) {
  const allowed = APPLICATION_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new ValidationError('This CA application status change is not allowed');
  }
}
