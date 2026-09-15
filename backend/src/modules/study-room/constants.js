export const CRYPTO_PROTOCOL = 'webcrypto-ecdh-aesgcm-v1';

export const CONVERSATION_TYPES = Object.freeze(['BATCH', 'PRIVATE']);

export const MODERATION_MODES = Object.freeze(['ADMIN_REVIEW', 'NON_REVIEW']);

export const RESOURCE_STATES = Object.freeze([
  'UPLOADING',
  'QUARANTINED',
  'SCANNING',
  'PENDING_REVIEW',
  'AVAILABLE',
  'REJECTED',
  'REMOVED',
  'SCAN_FAILED',
]);

export const REPORT_CATEGORIES = Object.freeze([
  'INAPPROPRIATE',
  'MALICIOUS',
  'MISLEADING',
  'POLICY',
  'OTHER',
]);

export const REPORT_STATUSES = Object.freeze(['OPEN', 'RESOLVED', 'DISMISSED']);

export const FOLDER_VISIBILITY = Object.freeze(['COMMON']);
