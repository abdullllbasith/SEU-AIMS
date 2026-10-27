import assert from 'node:assert/strict';
import test from 'node:test';
import { ROLES } from '../../src/shared/constants/roles.js';
import {
  canAccessStudyRoom,
  canViewStudentOwnedRecord,
  canManageSubjectOffering,
  canActAsDepartmentAdmin,
  isUsableAccount,
} from '../../src/modules/authentication/policies/authorization.policies.js';

const student = { userId: 's1', role: ROLES.STUDENT, departmentId: 'd1' };
const lecturer = { userId: 'l1', role: ROLES.LECTURER, departmentId: 'd1' };
const admin = { userId: 'a1', role: ROLES.DEPARTMENT_ADMINISTRATOR, departmentId: 'd1' };

test('Study Room is student-only', () => {
  assert.equal(canAccessStudyRoom(student), true);
  assert.equal(canAccessStudyRoom(lecturer), false);
  assert.equal(canAccessStudyRoom(admin), false);
  assert.equal(canAccessStudyRoom(null), false);
});

test('students can only view their own records', () => {
  assert.equal(canViewStudentOwnedRecord(student, 's1'), true);
  assert.equal(canViewStudentOwnedRecord(student, 's2'), false);
  assert.equal(canViewStudentOwnedRecord(lecturer, 's1'), false);
  assert.equal(canViewStudentOwnedRecord(admin, 's1'), false);
});

test('lecturers need an active assignment to the offering', () => {
  assert.equal(
    canManageSubjectOffering(lecturer, { lecturerUserId: 'l1', isActive: true }),
    true,
  );
  assert.equal(
    canManageSubjectOffering(lecturer, { lecturerUserId: 'l2', isActive: true }),
    false,
  );
  assert.equal(canManageSubjectOffering(student, { lecturerUserId: 's1', isActive: true }), false);
});

test('department administrators are scoped when a department id is present', () => {
  assert.equal(canActAsDepartmentAdmin(admin, 'd1'), true);
  assert.equal(canActAsDepartmentAdmin(admin, 'd2'), false);
  assert.equal(canActAsDepartmentAdmin(lecturer, 'd1'), false);
});

test('suspended accounts are not usable', () => {
  assert.equal(isUsableAccount({ accountStatus: 'ACTIVE' }), true);
  assert.equal(isUsableAccount({ accountStatus: 'SUSPENDED' }), false);
  assert.equal(isUsableAccount({ accountStatus: 'DEACTIVATED' }), false);
});
