import assert from 'node:assert/strict';
import test from 'node:test';
import { ROLES, ROLE_VALUES, isApprovedRole } from '../../src/shared/constants/roles.js';

test('only the three approved application roles exist', () => {
  assert.deepEqual(ROLE_VALUES.slice().sort(), [
    'DEPARTMENT_ADMINISTRATOR',
    'LECTURER',
    'STUDENT',
  ]);
  assert.equal(ROLES.STUDENT, 'STUDENT');
  assert.equal(isApprovedRole('HOD'), false);
  assert.equal(isApprovedRole('SUPER_ADMIN'), false);
});
