/**
 * KPI catalog for the admin dashboard. Values are always computed from source collections.
 * This file is documentation-in-code, not an authoritative store.
 */
export const DASHBOARD_CACHE_TTL_MS = 15_000;
export const EXPORT_STUDENT_MAX_ROWS = 500;
export const SEARCH_MAX_LENGTH = 64;

export const PENDING_RESULT_IMPORT_STATUSES = Object.freeze([
  'UPLOADED',
  'PROCESSING',
  'PARSED',
  'VALIDATION_ISSUES',
  'READY_FOR_REVIEW',
  'CONFIRMED',
]);

export const FAILED_RESULT_IMPORT_STATUSES = Object.freeze(['FAILED', 'PARSE_FAILED', 'REJECTED_FILE']);

export const PENDING_CA_APPLICATION_STATUSES = Object.freeze(['SUBMITTED', 'UNDER_VERIFICATION']);

export const KPI_CATALOG = Object.freeze([
  {
    key: 'activeStudents',
    sourceDomain: 'authentication',
    calculation: "Count User where role=STUDENT, accountStatus=ACTIVE, departmentId=principal",
    refresh: 'on-request, cached ≤15s per department',
    authorization: 'DEPARTMENT_ADMINISTRATOR of that department',
  },
  {
    key: 'activeLecturers',
    sourceDomain: 'authentication',
    calculation: "Count User where role=LECTURER, accountStatus=ACTIVE, departmentId=principal",
    refresh: 'on-request, cached ≤15s per department',
    authorization: 'DEPARTMENT_ADMINISTRATOR of that department',
  },
  {
    key: 'activeBatches',
    sourceDomain: 'academic-foundation',
    calculation: 'Count Batch ACTIVE in department',
    refresh: 'on-request, cached ≤15s per department',
    authorization: 'DEPARTMENT_ADMINISTRATOR of that department',
  },
  {
    key: 'activeSemesters',
    sourceDomain: 'academic-foundation',
    calculation: 'Count Semester ACTIVE in department',
    refresh: 'on-request, cached ≤15s per department',
    authorization: 'DEPARTMENT_ADMINISTRATOR of that department',
  },
  {
    key: 'activeSubjectOfferings',
    sourceDomain: 'academic-foundation',
    calculation: 'Count SubjectOffering ACTIVE in department',
    refresh: 'on-request, cached ≤15s per department',
    authorization: 'DEPARTMENT_ADMINISTRATOR of that department',
  },
  {
    key: 'unpublishedOfficialResources',
    sourceDomain: 'learning-environment',
    calculation: "Count OfficialResource publicationState in DRAFT|UNPUBLISHED, deletedAt null, departmentId=principal",
    refresh: 'on-request, cached ≤15s per department',
    authorization: 'DEPARTMENT_ADMINISTRATOR of that department',
  },
  {
    key: 'pendingResultImports',
    sourceDomain: 'results',
    calculation: 'Count ResultImport in pending processing statuses for the department',
    refresh: 'on-request, cached ≤15s per department',
    authorization: 'DEPARTMENT_ADMINISTRATOR of that department',
  },
  {
    key: 'unresolvedEcaConditions',
    sourceDomain: 'ca-recovery',
    calculation: "Count IncompleteCa status=OPEN for the department (opened from official E(CA) results)",
    refresh: 'on-request, cached ≤15s per department',
    authorization: 'DEPARTMENT_ADMINISTRATOR of that department',
  },
  {
    key: 'pendingCaApplications',
    sourceDomain: 'ca-recovery',
    calculation: 'Count CaApplication SUBMITTED or UNDER_VERIFICATION for the department',
    refresh: 'on-request, cached ≤15s per department',
    authorization: 'DEPARTMENT_ADMINISTRATOR of that department',
  },
  {
    key: 'upcomingCaAssessments',
    sourceDomain: 'ca-recovery',
    calculation: 'Count CaSchedule cancelledAt null and scheduledAt >= now for the department',
    refresh: 'on-request, cached ≤15s per department',
    authorization: 'DEPARTMENT_ADMINISTRATOR of that department',
  },
  {
    key: 'failedNotifications',
    sourceDomain: 'notifications',
    calculation: "Count Notification status=FAILED for the department",
    refresh: 'on-request, cached ≤15s per department',
    authorization: 'DEPARTMENT_ADMINISTRATOR of that department',
  },
  {
    key: 'failedBackgroundJobs',
    sourceDomain: 'operations',
    calculation: 'Queue failed list length from infrastructure snapshot (process/Redis, not department-partitioned)',
    refresh: 'on-request',
    authorization: 'DEPARTMENT_ADMINISTRATOR (queue is platform-wide)',
  },
  {
    key: 'deniedAuditEvents',
    sourceDomain: 'audit-security',
    calculation: "Count AuditEvent result=DENIED for the department",
    refresh: 'on-request, cached ≤15s per department',
    authorization: 'DEPARTMENT_ADMINISTRATOR of that department',
  },
]);
