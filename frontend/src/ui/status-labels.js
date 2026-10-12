/** Human-readable labels for stored enums. Prefer API names when present. */

const WORKFLOW = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted — print and obtain HOD signature',
  UNDER_VERIFICATION: 'Physical copy received',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SCHEDULED: 'Assessment scheduled',
  COMPLETED: 'Assessment completed (official result unchanged until a new import)',
  RESOLVED: 'Condition resolved by official result',
};

const CONDITION = {
  OPEN: 'Open',
  IN_APPLICATION: 'In application',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const PUBLICATION = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  UNPUBLISHED: 'Unpublished',
  ARCHIVED: 'Archived',
};

const SCAN = {
  PENDING: 'Scan pending',
  SCANNING: 'Scanning',
  SAFE: 'Safe',
  UNSAFE: 'Unsafe',
  FAILED: 'Scan failed',
  QUARANTINED: 'Quarantined',
};

const CATEGORY = {
  LECTURE: 'Lecture',
  TUTORIAL: 'Tutorial',
  LAB: 'Lab',
  PRACTICAL: 'Practical',
  REFERENCE: 'Reference',
  PAST_PAPER: 'Past paper',
  ASSIGNMENT: 'Assignment',
  OTHER: 'Other',
};

const EVENT_TYPE = {
  CA_SCHEDULE: 'CA schedule',
  ASSIGNMENT_DEADLINE: 'Assignment deadline',
  DEPARTMENT: 'Academic event',
  OTHER: 'Other event',
};

const PDF = {
  PENDING: 'PDF pending',
  READY: 'PDF ready',
  FAILED: 'PDF failed',
};

function label(map, value, fallback = '') {
  const key = String(value ?? '').trim();
  if (!key) {
    return fallback;
  }
  return map[key] || key.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function formatWorkflowStatus(value) {
  return label(WORKFLOW, value);
}

export function formatConditionStatus(value) {
  return label(CONDITION, value);
}

export function formatPublicationState(value) {
  return label(PUBLICATION, value);
}

export function formatScanStatus(value) {
  return label(SCAN, value);
}

export function formatResourceCategory(value) {
  return label(CATEGORY, value);
}

export function formatEventType(value) {
  return label(EVENT_TYPE, value);
}

export function formatPdfStatus(value) {
  return label(PDF, value);
}
