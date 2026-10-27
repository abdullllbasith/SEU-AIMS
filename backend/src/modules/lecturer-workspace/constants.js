/**
 * Lecturer dashboard catalog. Values are always computed from source collections.
 * Not an authoritative store. Not department-wide admin KPIs.
 */
export const DASHBOARD_CACHE_TTL_MS = 15_000;
export const SEARCH_MAX_LENGTH = 64;
export const RESOURCE_PAGE_SIZE_DEFAULT = 20;
export const RESOURCE_PAGE_SIZE_MAX = 50;

export const TEACHING_SUMMARY_CATALOG = Object.freeze([
  {
    key: 'activeAssignments',
    sourceDomain: 'academic-foundation',
    calculation: 'Count LecturerAssignment isActive=true for principal.userId',
    authorization: 'LECTURER session identity',
  },
  {
    key: 'publishedOfficialResources',
    sourceDomain: 'learning-environment',
    calculation: 'Count OfficialResource PUBLISHED on assigned offerings',
    authorization: 'assigned subject offerings only',
  },
  {
    key: 'unpublishedOfficialResources',
    sourceDomain: 'learning-environment',
    calculation: 'Count OfficialResource DRAFT|UNPUBLISHED on assigned offerings',
    authorization: 'assigned subject offerings only',
  },
  {
    key: 'approvedCaAwaitingSchedule',
    sourceDomain: 'ca-recovery',
    calculation: 'Count lecturer-eligible CA rows with workflowStatus APPROVED',
    authorization: 'active assignments only (CA service)',
  },
  {
    key: 'unreadNotifications',
    sourceDomain: 'notifications',
    calculation: 'unreadCount for principal',
    authorization: 'own inbox',
  },
]);
