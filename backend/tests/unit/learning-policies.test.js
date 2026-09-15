import assert from 'node:assert/strict';
import test from 'node:test';
import { ROLES } from '../../src/shared/constants/roles.js';
import {
  canManageOfferingResources,
  canStudentAccessOffering,
  isStudentVisibleResource,
} from '../../src/modules/learning-environment/policies/learning.policies.js';

const student = { userId: 's1', role: ROLES.STUDENT, departmentId: 'd1' };
const lecturer = { userId: 'l1', role: ROLES.LECTURER, departmentId: 'd1' };
const admin = { userId: 'a1', role: ROLES.DEPARTMENT_ADMINISTRATOR, departmentId: 'd1' };
const offering = { departmentId: 'd1', batchId: 'b1', academicYearId: 'y1', semesterId: 'sem1' };
const context = {
  userId: 's1',
  departmentId: 'd1',
  batchId: 'b1',
  currentAcademicYearId: 'y1',
  currentSemesterId: 'sem1',
};

test('students access offerings by current or historical batch/year/semester', () => {
  assert.equal(canStudentAccessOffering(student, context, offering, []), true);
  assert.equal(
    canStudentAccessOffering(student, context, { ...offering, semesterId: 'sem2' }, [
      { academicYearId: 'y1', semesterId: 'sem2' },
    ]),
    true,
  );
  assert.equal(canStudentAccessOffering(student, context, { ...offering, batchId: 'b2' }, []), false);
  assert.equal(canStudentAccessOffering(lecturer, context, offering, []), false);
});

test('lecturers manage resources only with an active assignment', () => {
  assert.equal(
    canManageOfferingResources(lecturer, offering, { lecturerUserId: 'l1', isActive: true }),
    true,
  );
  assert.equal(
    canManageOfferingResources(lecturer, offering, { lecturerUserId: 'l2', isActive: true }),
    false,
  );
  assert.equal(canManageOfferingResources(admin, offering, null), true);
  assert.equal(canManageOfferingResources(student, offering, null), false);
});

test('students only see published resources whose files are safe and available', () => {
  assert.equal(
    isStudentVisibleResource(
      { publicationState: 'PUBLISHED' },
      { scanStatus: 'SAFE', availability: 'AVAILABLE' },
    ),
    true,
  );
  assert.equal(
    isStudentVisibleResource(
      { publicationState: 'DRAFT' },
      { scanStatus: 'SAFE', availability: 'AVAILABLE' },
    ),
    false,
  );
  assert.equal(
    isStudentVisibleResource(
      { publicationState: 'PUBLISHED' },
      { scanStatus: 'QUARANTINED', availability: 'UNAVAILABLE' },
    ),
    false,
  );
});
