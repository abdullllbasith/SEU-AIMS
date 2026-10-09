import assert from 'node:assert/strict';
import test from 'node:test';
import { isAtOrBeforeDeadline, windowLifecycle } from '../../src/modules/ca-recovery/utils/http.js';
import { CA_REMINDER_OFFSETS_DAYS } from '../../src/modules/ca-recovery/constants.js';
import { assertApplicationTransition } from '../../src/modules/ca-recovery/services/transitions.js';

test('application window lifecycle is derived from published, suspended, and server time', () => {
  const base = {
    published: true,
    suspended: false,
    opensAt: new Date('2026-01-10T00:00:00.000Z'),
    closesAt: new Date('2026-01-20T00:00:00.000Z'),
  };
  assert.equal(windowLifecycle({ ...base, published: false }, new Date('2026-01-15Z')), 'UNPUBLISHED');
  assert.equal(windowLifecycle({ ...base, suspended: true }, new Date('2026-01-15Z')), 'SUSPENDED');
  assert.equal(windowLifecycle(base, new Date('2026-01-09T23:59:59.000Z')), 'SCHEDULED');
  assert.equal(windowLifecycle(base, new Date('2026-01-10T00:00:00.000Z')), 'OPEN');
  assert.equal(windowLifecycle(base, new Date('2026-01-20T00:00:00.000Z')), 'OPEN');
  assert.equal(windowLifecycle(base, new Date('2026-01-20T00:00:01.000Z')), 'CLOSED');
});

test('deadline lock uses inclusive close timestamp', () => {
  const close = new Date('2026-01-20T00:00:00.000Z');
  assert.equal(isAtOrBeforeDeadline(new Date(close.getTime() - 1000), close), true);
  assert.equal(isAtOrBeforeDeadline(close, close), true);
  assert.equal(isAtOrBeforeDeadline(new Date(close.getTime() + 1000), close), false);
});

test('application status changes follow the allowed transitions', () => {
  assertApplicationTransition('DRAFT', 'SUBMITTED');
  assertApplicationTransition('APPROVED', 'RESOLVED');
  assert.throws(() => assertApplicationTransition('COMMITTED', 'DRAFT'), /not allowed/);
  assert.throws(() => assertApplicationTransition('RESOLVED', 'DRAFT'), /not allowed/);
});

test('reminder offsets remain 7, 3, and 1 days', () => {
  assert.deepEqual([...CA_REMINDER_OFFSETS_DAYS], [7, 3, 1]);
});
