const DAY_MS = 24 * 60 * 60 * 1000;

export const SEARCH_MAX_LENGTH = 64;

export function sanitizeWorkspaceSearch(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return '';
  }
  const text = String(raw).trim();
  if (text.length > SEARCH_MAX_LENGTH) {
    throw new Error('SEARCH_TOO_LONG');
  }
  if (/[.*+?^${}()|[\]\\]/.test(text)) {
    throw new Error('SEARCH_PATTERN');
  }
  return text;
}

export function prefixRegex(value) {
  return new RegExp(`^${value}`, 'i');
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

/**
 * Groups calendar events by actual start date. Does not invent urgency.
 */
export function groupUpcomingEvents(events = [], now = new Date()) {
  const todayStart = startOfDay(now);
  const todayEnd = new Date(todayStart.getTime() + DAY_MS);
  const fewEnd = new Date(todayStart.getTime() + 3 * DAY_MS);
  const weekEnd = new Date(todayStart.getTime() + 7 * DAY_MS);
  const groups = { today: [], nextFewDays: [], nextWeek: [], later: [] };
  for (const event of events) {
    if (!event?.startsAt) {
      continue;
    }
    const at = new Date(event.startsAt);
    if (at < now) {
      continue;
    }
    const bucket =
      at < todayEnd ? 'today' : at < fewEnd ? 'nextFewDays' : at < weekEnd ? 'nextWeek' : 'later';
    groups[bucket].push(event);
  }
  return groups;
}

function pushAttention(items, item) {
  items.push(item);
}

/**
 * Actionable cards from already-loaded domain payloads. No predictive scoring.
 */
export function buildAttentionItems({
  caRecovery,
  windowLifecycle,
  upcomingEvents = [],
  notices = [],
  notifications = [],
  recentResources = [],
  now = new Date(),
} = {}) {
  const items = [];
  if (windowLifecycle === 'OPEN' && caRecovery?.unresolvedConditions?.length) {
    pushAttention(items, {
      code: 'CA_WINDOW_OPEN',
      title: 'CA application window is open',
      href: '/ca',
      source: 'ca-recovery',
    });
  }
  if (caRecovery?.unresolvedConditions?.length) {
    pushAttention(items, {
      code: 'CA_CONDITION',
      title: `Unresolved incomplete CA (${caRecovery.unresolvedConditions.map((row) => row.subjectCode).join(', ')})`,
      href: '/ca',
      source: 'ca-recovery',
    });
  }
  const status = caRecovery?.application?.workflowStatus;
  const physical = caRecovery?.application?.physicalVerificationStatus;
  if (status === 'REJECTED') {
    pushAttention(items, {
      code: 'CA_REJECTED',
      title: 'CA application was rejected and may be reopened through CA recovery',
      href: '/ca',
      source: 'ca-recovery',
    });
  }
  if (status === 'UNDER_VERIFICATION' || physical === 'AWAITING_PHYSICAL') {
    pushAttention(items, {
      code: 'CA_PHYSICAL',
      title: 'Physical CA verification is still required',
      href: '/ca',
      source: 'ca-recovery',
    });
  }
  if (caRecovery?.upcomingSchedule?.scheduledAt) {
    pushAttention(items, {
      code: 'CA_ASSESSMENT',
      title: 'CA assessment is scheduled',
      href: '/ca',
      source: 'ca-recovery',
      at: caRecovery.upcomingSchedule.scheduledAt,
    });
  }
  const soon = upcomingEvents.filter((event) => {
    const at = new Date(event.startsAt);
    return at >= now && at.getTime() - now.getTime() <= 3 * DAY_MS;
  });
  for (const event of soon.slice(0, 5)) {
    pushAttention(items, {
      code: 'EVENT_UPCOMING',
      title: event.title,
      href: '/calendar',
      source: 'notices-calendar',
      at: event.startsAt,
    });
  }
  for (const notice of notices.filter((item) => item.priority === 'HIGH' || item.priority === 'URGENT').slice(0, 3)) {
    pushAttention(items, {
      code: 'NOTICE',
      title: notice.title,
      href: `/notices/${notice.id}`,
      source: 'notices-calendar',
    });
  }
  for (const row of notifications.filter((item) => !item.readAt && item.type === 'RESULTS_UPDATED').slice(0, 3)) {
    pushAttention(items, {
      code: 'RESULT_UPDATED',
      title: row.title || 'Official results were updated',
      href: row.actionPath || '/results/me',
      source: 'notifications',
    });
  }
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  for (const resource of recentResources.filter((item) => item.publishedAt && new Date(item.publishedAt) >= weekAgo).slice(0, 3)) {
    pushAttention(items, {
      code: 'RESOURCE_PUBLISHED',
      title: `${resource.subjectCode}: ${resource.title}`,
      href: resource.learningPath || '/learning',
      source: 'learning-environment',
    });
  }
  return items;
}

export function publicSection(result) {
  if (!result) {
    return { ok: false, error: 'Unavailable.' };
  }
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
