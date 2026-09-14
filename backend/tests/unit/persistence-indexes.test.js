import assert from 'node:assert/strict';
import test from 'node:test';
import { StudentAcademicContext } from '../../src/modules/academic-foundation/index.js';
import { SubjectOffering } from '../../src/modules/academic-foundation/index.js';
import { AcademicResult } from '../../src/modules/results/index.js';
import { IncompleteCa, CaApplication } from '../../src/modules/ca-recovery/index.js';
import { Notification } from '../../src/modules/notifications/index.js';
import { LecturerAssignment } from '../../src/modules/academic-foundation/index.js';

function uniqueIndexKeys(model) {
  return model.schema.indexes().filter(([_, options]) => options?.unique).map(([fields]) => fields);
}

test('registration number uniqueness is on student academic context, not user', () => {
  const keys = uniqueIndexKeys(StudentAcademicContext);
  assert.ok(keys.some((fields) => fields.registrationNumber === 1));
  assert.ok(keys.some((fields) => fields.userId === 1));
});

test('subject offering unique key is subject + batch + year + semester', () => {
  const keys = uniqueIndexKeys(SubjectOffering);
  assert.ok(
    keys.some(
      (fields) =>
        fields.subjectId === 1 &&
        fields.batchId === 1 &&
        fields.academicYearId === 1 &&
        fields.semesterId === 1,
    ),
  );
});

test('lecturer assignment uniqueness is lecturer + offering, allowing multiple lecturers', () => {
  const keys = uniqueIndexKeys(LecturerAssignment);
  assert.ok(keys.some((fields) => fields.lecturerUserId === 1 && fields.subjectOfferingId === 1));
  assert.equal(
    keys.some((fields) => Object.keys(fields).length === 1 && fields.subjectOfferingId === 1),
    false,
  );
});

test('official result unique key is registration number + subject code', () => {
  const keys = uniqueIndexKeys(AcademicResult);
  assert.ok(keys.some((fields) => fields.registrationNumber === 1 && fields.subjectCode === 1));
});

test('incomplete CA and CA application have distinct unique identities', () => {
  assert.ok(
    uniqueIndexKeys(IncompleteCa).some(
      (fields) =>
        fields.studentUserId === 1 &&
        fields.subjectId === 1 &&
        fields.academicYearId === 1 &&
        fields.semesterId === 1,
    ),
  );
  assert.ok(uniqueIndexKeys(CaApplication).some((fields) => fields.applicationId === 1));
});

test('notification idempotency key is unique', () => {
  assert.ok(uniqueIndexKeys(Notification).some((fields) => fields.idempotencyKey === 1));
});
