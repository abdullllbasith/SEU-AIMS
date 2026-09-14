import assert from 'node:assert/strict';
import test from 'node:test';
import { ROLES } from '../../src/shared/constants/roles.js';
import {
  canLecturerAccessOffering,
  canStudentAccessOwnContext,
  isOfferingInStudentCurrentContext,
} from '../../src/modules/academic-foundation/policies/academic.policies.js';
import { parsePagination } from '../../src/modules/academic-foundation/utils/pagination.js';

const student = { userId: 's1', role: ROLES.STUDENT, departmentId: 'd1' };
const lecturer = { userId: 'l1', role: ROLES.LECTURER, departmentId: 'd1' };

test('lecturer offering access requires an active assignment to that lecturer', () => {
  assert.equal(
    canLecturerAccessOffering(lecturer, { lecturerUserId: 'l1', isActive: true }),
    true,
  );
  assert.equal(
    canLecturerAccessOffering(lecturer, { lecturerUserId: 'l1', isActive: false }),
    false,
  );
  assert.equal(
    canLecturerAccessOffering(student, { lecturerUserId: 's1', isActive: true }),
    false,
  );
});

test('students can only access their own academic context', () => {
  assert.equal(canStudentAccessOwnContext(student, { userId: 's1' }), true);
  assert.equal(canStudentAccessOwnContext(student, { userId: 's2' }), false);
  assert.equal(canStudentAccessOwnContext(lecturer, { userId: 'l1' }), false);
});

test('offering audience is derived from current batch, year, and semester', () => {
  const context = {
    departmentId: 'd1',
    batchId: 'b1',
    currentAcademicYearId: 'y1',
    currentSemesterId: 'sem1',
  };
  assert.equal(
    isOfferingInStudentCurrentContext(context, {
      departmentId: 'd1',
      batchId: 'b1',
      academicYearId: 'y1',
      semesterId: 'sem1',
    }),
    true,
  );
  assert.equal(
    isOfferingInStudentCurrentContext(context, {
      departmentId: 'd1',
      batchId: 'b1',
      academicYearId: 'y1',
      semesterId: 'sem2',
    }),
    false,
  );
});

test('list pagination is bounded', () => {
  const parsed = parsePagination({ page: '2', pageSize: '999' });
  assert.equal(parsed.page, 2);
  assert.equal(parsed.pageSize, 50);
  assert.equal(parsed.skip, 50);
});
