const DAY_MS = 24 * 60 * 60 * 1000;

export function groupUpcomingEvents(events = [], now = new Date()) {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
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

export function buildLecturerAttention({
  unpublishedCount = 0,
  approvedAwaitingSchedule = 0,
  upcomingSchedules = [],
  unreadCount = 0,
  inactiveAssignments = 0,
  lecturerStatus,
} = {}) {
  const items = [];
  if (lecturerStatus && lecturerStatus !== 'VERIFIED') {
    items.push({
      code: 'LECTURER_UNVERIFIED',
      title: 'Lecturer verification is still required before teaching operations',
      href: '/profile',
      source: 'authentication',
    });
  }
  if (unpublishedCount > 0) {
    items.push({
      code: 'UNPUBLISHED_RESOURCES',
      title: `Official resources awaiting publish (${unpublishedCount})`,
      href: '/lecturer/learning',
      source: 'learning-environment',
    });
  }
  if (approvedAwaitingSchedule > 0) {
    items.push({
      code: 'CA_APPROVED_UNSCHEDULED',
      title: `Approved CA students need a schedule (${approvedAwaitingSchedule})`,
      href: '/lecturer/ca',
      source: 'ca-recovery',
    });
  }
  if (upcomingSchedules.length) {
    items.push({
      code: 'CA_SCHEDULED',
      title: 'Upcoming CA assessment schedule',
      href: '/lecturer/ca',
      source: 'ca-recovery',
      at: upcomingSchedules[0].scheduledAt,
    });
  }
  if (unreadCount > 0) {
    items.push({
      code: 'UNREAD_NOTIFICATIONS',
      title: `Unread notifications (${unreadCount})`,
      href: '/notifications',
      source: 'notifications',
    });
  }
  if (inactiveAssignments > 0) {
    items.push({
      code: 'INACTIVE_ASSIGNMENTS',
      title: 'Some subject offering assignments are no longer active (read-only)',
      href: '/lecturer/offerings',
      source: 'academic-foundation',
    });
  }
  return items;
}
