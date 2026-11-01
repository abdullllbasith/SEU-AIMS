export const NOTIFICATION_CHANNELS = Object.freeze(['IN_APP', 'EMAIL', 'WHATSAPP']);

export const NOTIFICATION_STATUSES = Object.freeze([
  'PENDING',
  'SCHEDULED',
  'QUEUED',
  'SENDING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'RETRYING',
  'CANCELLED',
]);

export const NOTIFICATION_CATEGORIES = Object.freeze([
  'academic',
  'results',
  'ca_recovery',
  'assignment',
  'calendar',
  'notice',
  'system',
  'security',
]);

export const TEMPLATE_ALLOWED_VARS = Object.freeze([
  'title',
  'applicationId',
  'eventTitle',
  'when',
  'reason',
  'subjectCode',
  'subjectName',
  'venue',
  'examDate',
  'examTime',
  'registrationNumber',
  'offsetDays',
]);

/** Configurable mandatory types. Users cannot disable these channels via preferences. */
export const MANDATORY_NOTIFICATION_TYPES = Object.freeze([
  'CA_APPLICATION_SUBMITTED',
  'CA_APPLICATION_APPROVED',
  'CA_APPLICATION_REJECTED',
  'CA_APPLICATION_REOPENED',
  'CA_WINDOW_OPEN',
  'CA_LECTURER_APPROVED_STUDENT',
  'CA_EXAM_SCHEDULED',
  'CA_EXAM_RESCHEDULED',
  'CA_EXAM_CANCELLED',
  'CA_EXAM_COMPLETED',
  'CA_EXAM_MISSED',
  'RESULTS_UPDATED',
  'NOTICE_PUBLISHED',
]);

export const OPTIONAL_NOTIFICATION_TYPES = Object.freeze([
  'CA_REMINDER',
  'CA_SCHEDULED',
  'CALENDAR_REMINDER',
  'STUDY_ROOM_NEW_MESSAGE',
]);

export const DEFAULT_LOCALE = 'en';
export const SUPPORTED_LOCALES = Object.freeze(['en', 'ta', 'si']);
export const MAX_DELIVERY_ATTEMPTS = 5;
