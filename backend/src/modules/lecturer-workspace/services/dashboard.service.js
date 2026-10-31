import { DASHBOARD_CACHE_TTL_MS } from '../constants.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { upcomingEvents, listNotices } from '../../notices-calendar/index.js';
import { unreadCount, listInbox } from '../../notifications/index.js';
import { listApprovedForLecturer, listSchedules } from '../../ca-recovery/index.js';
import { dashboardCacheKey, getDashboardCache, setDashboardCache } from './dashboard-cache.js';
import { assertLecturer } from './scope.js';
import { buildLecturerAttention, groupUpcomingEvents } from './attention.js';
import {
  assignmentVersion,
  listAssignedOfferings,
  resourceCountsByOffering,
  requireAssignedOffering,
  listResourcesForOffering,
} from './offerings.service.js';
import { listOfferingRoster } from './roster.service.js';

async function settle(label, fn) {
  try {
    return { ok: true, data: await fn() };
  } catch {
    return { ok: false, error: `${label} is temporarily unavailable.` };
  }
}

function publicSection(result) {
  if (!result) {
    return { ok: false, error: 'Unavailable.' };
  }
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function getLecturerDashboard(principal, { refresh = false } = {}) {
  assertLecturer(principal);
  const version = await assignmentVersion(principal);
  const key = dashboardCacheKey({ userId: principal.userId, assignmentVersion: version });
  if (!refresh) {
    const cached = getDashboardCache(key);
    if (cached) {
      return { ...cached, cache: { hit: true, ttlMs: DASHBOARD_CACHE_TTL_MS } };
    }
  }

  const offeringsBundle = await listAssignedOfferings(principal);
  const current = offeringsBundle.items.filter((item) => item.canManage);
  const historical = offeringsBundle.items.filter((item) => !item.canManage);
  const offeringIds = offeringsBundle.items.map((item) => item.id);

  const [resources, events, notices, unread, inbox, caEligible, caSchedules] = await Promise.all([
    settle('Official resources', () => resourceCountsByOffering(offeringIds)),
    settle('Calendar', () => upcomingEvents(principal)),
    settle('Notices', () => listNotices(principal, { pageSize: 5 })),
    settle('Notifications', () => unreadCount(principal)),
    settle('Inbox', () => listInbox(principal, { pageSize: 5 })),
    settle('CA eligible students', () => listApprovedForLecturer(principal)),
    settle('CA schedules', () => listSchedules(principal)),
  ]);

  const countMap = resources.ok ? resources.data : new Map();
  let published = 0;
  let unpublished = 0;
  const offerings = offeringsBundle.items.map((item) => {
    const counts = countMap.get(item.id) || { published: 0, unpublished: 0 };
    published += counts.published;
    unpublished += counts.unpublished;
    return {
      ...item,
      resources: counts,
    };
  });

  const eligibleItems = caEligible.ok ? caEligible.data.items : [];
  const approvedAwaiting = eligibleItems.filter((row) => row.examStatus === 'READY_TO_SCHEDULE').length;
  const scheduleItems = caSchedules.ok
    ? caSchedules.data.items.filter((row) => !row.cancelledAt && row.status === 'ACTIVE')
    : [];
  const eventItems = events.ok ? events.data.items : [];
  const unreadValue = unread.ok ? unread.data.count : null;

  const attention = buildLecturerAttention({
    unpublishedCount: unpublished,
    approvedAwaitingSchedule: approvedAwaiting,
    upcomingSchedules: scheduleItems,
    unreadCount: unreadValue || 0,
    inactiveAssignments: historical.length,
    lecturerStatus: offeringsBundle.lecturerStatus,
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    lecturerStatus: offeringsBundle.lecturerStatus,
    summary: {
      assignedOfferings: offerings.length,
      activeAssignments: current.length,
      historicalAssignments: historical.length,
      publishedOfficialResources: published,
      unpublishedOfficialResources: unpublished,
      approvedCaAwaitingSchedule: approvedAwaiting,
      scheduledCaAssessments: scheduleItems.length,
      unreadNotifications: unreadValue,
    },
    attention,
    deadlineGroups: groupUpcomingEvents(eventItems),
    currentOfferings: offerings.filter((item) => item.canManage),
    historicalOfferings: offerings.filter((item) => !item.canManage),
    upcomingEvents: eventItems,
    notices: notices.ok ? notices.data.items || notices.data : [],
    notifications: {
      unreadCount: unreadValue,
      recent: inbox.ok ? inbox.data.items : [],
    },
    caRecovery: {
      eligible: eligibleItems.map((row) => ({
        applicationId: row.applicationId,
        registrationNumber: row.registrationNumber,
        workflowStatus: row.workflowStatus,
        subjectOfferingId: row.subjectOfferingId,
        subjectId: row.subjectId,
      })),
      schedules: scheduleItems.map((row) => ({
        id: row.id,
        scheduledAt: row.scheduledAt,
        venue: row.venue || '',
        subjectOfferingId: row.subjectOfferingId ? String(row.subjectOfferingId) : null,
        applicationId: row.applicationId,
      })),
      caPath: '/lecturer/ca',
    },
    shortcuts: {
      search: '/lecturer/search',
      learning: '/lecturer/learning',
      ca: '/lecturer/ca',
      calendar: '/calendar',
      notices: '/notices',
      profile: '/profile',
      notifications: '/notifications',
    },
    sections: {
      offerings: { ok: true },
      resources: publicSection(resources),
      calendar: publicSection(events),
      notices: publicSection(notices),
      notifications: unread.ok && inbox.ok ? { ok: true } : { ok: false, error: 'Notifications are temporarily unavailable.' },
      ca: caEligible.ok && caSchedules.ok ? { ok: true } : { ok: false, error: 'CA recovery is temporarily unavailable.' },
    },
    cache: {
      hit: false,
      ttlMs: DASHBOARD_CACHE_TTL_MS,
      note: 'Lecturer-scoped in-process cache keyed by user and assignment version. Refresh with ?refresh=true.',
    },
  };
  setDashboardCache(key, payload);
  return payload;
}

export async function getAssignedOfferings(principal) {
  assertLecturer(principal);
  const { items, lecturerStatus } = await listAssignedOfferings(principal);
  const counts = await resourceCountsByOffering(items.map((item) => item.id));
  return {
    lecturerStatus,
    items: items.map((item) => ({
      ...item,
      resources: counts.get(item.id) || { published: 0, unpublished: 0 },
    })),
  };
}

export async function getOfferingWorkspace(principal, offeringId, query = {}) {
  assertLecturer(principal);
  const { item, lecturerStatus } = await requireAssignedOffering(principal, offeringId);
  const [resources, events, caEligible, caSchedules, roster] = await Promise.all([
    settle('Official resources', () => listResourcesForOffering(item.id, query)),
    settle('Calendar', () => upcomingEvents(principal)),
    settle('CA eligible students', () => listApprovedForLecturer(principal)),
    settle('CA schedules', () => listSchedules(principal)),
    settle('Offering roster', () => listOfferingRoster(principal, item.id)),
  ]);
  const offeringEvents = events.ok
    ? events.data.items.filter((row) => row.subjectOfferingId === item.id)
    : [];
  const eligible = caEligible.ok
    ? caEligible.data.items.filter((row) => String(row.subjectOfferingId) === item.id)
    : [];
  const schedules = caSchedules.ok
    ? caSchedules.data.items.filter((row) => String(row.subjectOfferingId) === item.id && !row.cancelledAt && row.status === 'ACTIVE')
    : [];
  return {
    lecturerStatus,
    offering: item,
    canManage: item.canManage,
    resources: resources.ok ? resources.data : { items: [], total: 0, page: 1, pageSize: 20 },
    deadlines: offeringEvents.filter((row) => row.eventType === 'ASSIGNMENT_DEADLINE'),
    calendar: offeringEvents,
    caRecovery: {
      eligible: eligible.map((row) => ({
        applicationId: row.applicationId,
        registrationNumber: row.registrationNumber,
        workflowStatus: row.workflowStatus,
        subjectOfferingId: row.subjectOfferingId,
      })),
      schedules,
    },
    sections: {
      resources: publicSection(resources),
      calendar: publicSection(events),
      ca: caEligible.ok && caSchedules.ok ? { ok: true } : { ok: false, error: 'CA recovery is temporarily unavailable.' },
    },
    links: {
      learning: item.learningPath,
      ca: '/lecturer/ca',
      calendar: '/calendar',
    },
    roster: roster.ok ? roster.data : { items: [] },
  };
}

export async function getUpcoming(principal) {
  assertLecturer(principal);
  const events = await upcomingEvents(principal);
  return {
    generatedAt: new Date().toISOString(),
    deadlineGroups: groupUpcomingEvents(events.items),
    items: events.items,
  };
}

export async function getAssignments(principal) {
  assertLecturer(principal);
  const events = await upcomingEvents(principal);
  return {
    items: events.items.filter((item) => item.eventType === 'ASSIGNMENT_DEADLINE'),
    note: 'Assignment deadlines are CalendarEvent records. Create or edit them with /api/calendar/lecturer/events. There is no separate grading/submission domain.',
  };
}

export async function getCaEligible(principal) {
  assertLecturer(principal);
  return listApprovedForLecturer(principal);
}

export async function getCaSchedules(principal) {
  assertLecturer(principal);
  return listSchedules(principal);
}

export async function getOfferingRoster(principal, offeringId) {
  assertLecturer(principal);
  return listOfferingRoster(principal, offeringId);
}

export function rejectLecturerMutation(kind) {
  const messages = {
    caApprove: 'CA approval is not a lecturer operation',
    results: 'Official results cannot be mutated from the lecturer workspace',
    assignmentsWrite: 'Create assignment deadlines with /api/calendar/lecturer/events',
    resourcesWrite: 'Manage official resources with /api/learning',
  };
  throw new ForbiddenError(messages[kind] || 'Forbidden');
}
