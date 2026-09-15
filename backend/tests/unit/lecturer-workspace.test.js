import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardCacheKey } from '../../src/modules/lecturer-workspace/services/dashboard-cache.js';
import { sanitizeWorkspaceSearch, canManageAssignment } from '../../src/modules/lecturer-workspace/services/scope.js';
import { buildLecturerAttention, groupUpcomingEvents } from '../../src/modules/lecturer-workspace/services/attention.js';
import { TEACHING_SUMMARY_CATALOG } from '../../src/modules/lecturer-workspace/constants.js';

test('lecturer dashboard cache keys include user and assignment version', () => {
  assert.equal(
    dashboardCacheKey({ userId: 'lecturer-a', assignmentVersion: '2:1:9' }),
    'dashboard:lecturer:lecturer-a:2:1:9',
  );
  assert.notEqual(dashboardCacheKey({ userId: 'lecturer-a', assignmentVersion: '1' }), 'dashboard:lecturer');
});

test('lecturer search rejects regex operators', () => {
  assert.equal(sanitizeWorkspaceSearch('ICT'), 'ICT');
  assert.throws(() => sanitizeWorkspaceSearch('.*'), /pattern/);
});

test('inactive or unverified lecturers cannot manage offerings', () => {
  const offering = { status: 'ACTIVE' };
  assert.equal(
    canManageAssignment({ assignment: { isActive: true }, offering, lecturerStatus: 'VERIFIED' }),
    true,
  );
  assert.equal(
    canManageAssignment({ assignment: { isActive: false }, offering, lecturerStatus: 'VERIFIED' }),
    false,
  );
  assert.equal(
    canManageAssignment({ assignment: { isActive: true }, offering, lecturerStatus: 'UNVERIFIED' }),
    false,
  );
});

test('teaching attention is derived from loaded counts, not rankings', () => {
  const items = buildLecturerAttention({
    unpublishedCount: 2,
    approvedAwaitingSchedule: 1,
    unreadCount: 3,
    inactiveAssignments: 1,
    lecturerStatus: 'UNVERIFIED',
  });
  assert.ok(items.some((item) => item.code === 'UNPUBLISHED_RESOURCES'));
  assert.ok(items.some((item) => item.code === 'CA_APPROVED_UNSCHEDULED'));
  assert.ok(items.some((item) => item.code === 'LECTURER_UNVERIFIED'));
  assert.ok(TEACHING_SUMMARY_CATALOG.every((row) => row.sourceDomain && row.calculation));
  const now = new Date('2026-09-16T10:00:00.000Z');
  const groups = groupUpcomingEvents([{ id: '1', title: 'Lab', startsAt: '2026-09-16T12:00:00.000Z' }], now);
  assert.equal(groups.today.length, 1);
});
