import assert from 'node:assert/strict';
import test from 'node:test';
import { presentGpaSummary } from '../../src/modules/student-experience/utils/gpa-presentation.js';
import { normalizePhone } from '../../src/modules/student-experience/utils/phone.js';
import { dashboardCacheKey } from '../../src/modules/student-experience/services/dashboard-cache.js';
import {
  buildAttentionItems,
  groupUpcomingEvents,
  sanitizeWorkspaceSearch,
} from '../../src/modules/student-experience/services/workspace.js';

test('missing GPA credits are not presented as zero averages', () => {
  const empty = presentGpaSummary({ gpa: 0, cgpa: 0, credits: 0, status: 'CURRENT' });
  assert.equal(empty.available, false);
  assert.equal(empty.gpa, null);
  assert.equal(empty.cgpa, null);
  const present = presentGpaSummary({ gpa: 3.5, cgpa: 3.5, credits: 3, classification: 'Pass', status: 'CURRENT' });
  assert.equal(present.available, true);
  assert.equal(present.gpa, 3.5);
  const stale = presentGpaSummary({ gpa: 3.5, cgpa: 3.5, credits: 3, status: 'STALE' });
  assert.equal(stale.available, false);
  assert.equal(stale.gpa, null);
});

test('phone numbers normalize to E.164 and reject junk', () => {
  assert.equal(normalizePhone('0771234567'), '+94771234567');
  assert.equal(normalizePhone(''), '');
  assert.throws(() => normalizePhone('not-a-phone'));
});

test('dashboard cache keys are student-scoped', () => {
  assert.equal(
    dashboardCacheKey({ userId: 'a', contextVersion: '1', gpaVersion: '2' }),
    'dashboard:student:a:1:2',
  );
});

test('workspace search rejects patterns and groups events by date', () => {
  assert.equal(sanitizeWorkspaceSearch('ICT'), 'ICT');
  assert.throws(() => sanitizeWorkspaceSearch('.*'), /SEARCH_PATTERN/);
  const now = new Date('2026-09-16T10:00:00.000Z');
  const groups = groupUpcomingEvents(
    [
      { id: '1', title: 'Today lab', startsAt: '2026-09-16T12:00:00.000Z' },
      { id: '2', title: 'Later exam', startsAt: '2026-10-01T12:00:00.000Z' },
    ],
    now,
  );
  assert.equal(groups.today.length, 1);
  assert.equal(groups.later.length, 1);
  const attention = buildAttentionItems({
    caRecovery: { unresolvedConditions: [{ subjectCode: 'ICT1233', status: 'OPEN' }] },
    windowLifecycle: 'OPEN',
    upcomingEvents: [],
    notices: [],
    notifications: [],
    recentResources: [],
  });
  assert.ok(attention.some((item) => item.code === 'CA_WINDOW_OPEN'));
  assert.ok(attention.some((item) => item.href === '/ca'));
});
