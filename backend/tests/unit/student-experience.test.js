import assert from 'node:assert/strict';
import test from 'node:test';
import { presentGpaSummary } from '../../src/modules/student-experience/utils/gpa-presentation.js';
import { normalizePhone } from '../../src/modules/student-experience/utils/phone.js';
import { dashboardCacheKey } from '../../src/modules/student-experience/services/dashboard-cache.js';

test('missing GPA credits are not presented as zero averages', () => {
  const empty = presentGpaSummary({ gpa: 0, cgpa: 0, credits: 0, status: 'CURRENT' });
  assert.equal(empty.available, false);
  assert.equal(empty.gpa, null);
  assert.equal(empty.cgpa, null);
  const present = presentGpaSummary({ gpa: 3.5, cgpa: 3.5, credits: 3, classification: 'Pass', status: 'CURRENT' });
  assert.equal(present.available, true);
  assert.equal(present.gpa, 3.5);
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
