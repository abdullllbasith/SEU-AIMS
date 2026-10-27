export const INCOMPLETE_CA_STATUSES = Object.freeze(['OPEN', 'IN_APPLICATION', 'RESOLVED']);

export const CA_APPLICATION_STATUSES = Object.freeze([
  'DRAFT',
  'SUBMITTED',
  'UNDER_VERIFICATION',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'COMPLETED',
  'RESOLVED',
]);

/** One active application per student+year+semester. Terminal cycles may be followed by a new application. */
export const CA_ACTIVE_APPLICATION_STATUSES = Object.freeze([
  'DRAFT',
  'SUBMITTED',
  'UNDER_VERIFICATION',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
]);

export const PHYSICAL_VERIFICATION_STATUSES = Object.freeze([
  'NOT_STARTED',
  'AWAITING_PHYSICAL',
  'PHYSICALLY_VERIFIED',
  'VERIFICATION_FAILED',
]);

export const CA_PDF_STATUSES = Object.freeze(['PENDING', 'GENERATING', 'READY', 'FAILED']);

export const CA_WINDOW_LIFECYCLES = Object.freeze([
  'UNPUBLISHED',
  'SCHEDULED',
  'OPEN',
  'CLOSED',
  'SUSPENDED',
]);

export const CA_APPLICATION_EVENT_TYPES = Object.freeze([
  'SUBMITTED',
  'REOPENED',
  'VERIFIED',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'COMPLETED',
]);

export const CA_REMINDER_OFFSETS_DAYS = Object.freeze([7, 3, 1]);

export const CA_PDF_TEMPLATE_VERSION = 'ca-application-v10';
