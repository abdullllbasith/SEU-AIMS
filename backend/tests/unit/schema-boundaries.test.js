import assert from 'node:assert/strict';
import test from 'node:test';
import { Message } from '../../src/modules/study-room/index.js';
import { AcademicResult, ResultImport } from '../../src/modules/results/index.js';
import { IncompleteCa, CaApplication } from '../../src/modules/ca-recovery/index.js';
import { GpaSnapshot } from '../../src/modules/gpa-cgpa/index.js';
import { StoredFile } from '../../src/modules/files/index.js';
import { Notification } from '../../src/modules/notifications/index.js';
import { User } from '../../src/modules/authentication/index.js';
import { OfficialResource } from '../../src/modules/learning-environment/index.js';
import { Department, Subject, SubjectOffering, StudentAcademicContext } from '../../src/modules/academic-foundation/index.js';
import { ROLES } from '../../src/shared/constants/roles.js';
import { CA_APPLICATION_STATUSES } from '../../src/modules/ca-recovery/constants.js';

test('chat messages persist encrypted payload fields, not plaintext text', () => {
  const paths = Object.keys(Message.schema.paths);
  assert.ok(paths.includes('encryptedPayload.ciphertext'));
  assert.ok(paths.includes('encryptedPayload.nonce'));
  assert.ok(paths.includes('encryptedPayload.keyVersion'));
  assert.equal(paths.includes('text'), false);
  assert.equal(paths.includes('plaintext'), false);
  assert.equal(paths.includes('body'), false);
});

test('official results are distinct from result imports', () => {
  assert.notEqual(AcademicResult.modelName, ResultImport.modelName);
  assert.ok(AcademicResult.schema.paths.registrationNumber);
  assert.ok(AcademicResult.schema.paths.subjectCode);
  assert.ok(ResultImport.schema.paths.processingStatus);
});

test('subjects expose credits and a GPA inclusion flag defaulting to true', () => {
  assert.ok(Subject.schema.paths.credits);
  assert.equal(Subject.schema.paths.countsForGpa.defaultValue, true);
});

test('incomplete CA is distinct from CA application and is not a boolean', () => {
  assert.notEqual(IncompleteCa.modelName, CaApplication.modelName);
  assert.ok(CA_APPLICATION_STATUSES.includes('SUBMITTED'));
  assert.ok(CA_APPLICATION_STATUSES.includes('APPROVED'));
  assert.ok(CA_APPLICATION_STATUSES.includes('REJECTED'));
  assert.equal(typeof IncompleteCa.schema.paths.status.options.enum, 'object');
});

test('GPA snapshots do not store official result rows', () => {
  const paths = Object.keys(GpaSnapshot.schema.paths);
  assert.equal(paths.includes('results'), false);
  assert.equal(paths.includes('resultCode'), false);
});

test('file scan and review states are separate; files start untrusted', () => {
  assert.ok(StoredFile.schema.paths.scanStatus);
  assert.ok(StoredFile.schema.paths.reviewStatus);
  assert.equal(StoredFile.schema.paths.availability.defaultValue, 'UNAVAILABLE');
});

test('notifications are standalone records with delivery channels', () => {
  assert.deepEqual(Notification.schema.paths.channel.enumValues, ['IN_APP', 'EMAIL', 'WHATSAPP']);
  assert.ok(Notification.schema.paths.idempotencyKey);
  assert.equal(User.schema.paths.notifications, undefined);
});

test('academic entities keep an active/archived lifecycle', () => {
  assert.deepEqual(Department.schema.paths.status.enumValues, ['ACTIVE', 'ARCHIVED']);
  assert.ok(Subject.schema.paths.status);
  assert.ok(SubjectOffering.schema.paths.status);
  assert.equal(StudentAcademicContext.schema.paths.registrationNumber.options.uppercase, true);
});

test('official resources belong to a subject offering, not a reusable subject alone', () => {
  assert.ok(OfficialResource.schema.paths.subjectOfferingId);
  assert.equal(OfficialResource.schema.paths.subjectId, undefined);
  assert.ok(OfficialResource.schema.paths.fileId);
});

test('user roles remain the approved set', () => {
  assert.deepEqual(User.schema.paths.role.enumValues.sort(), [
    ROLES.DEPARTMENT_ADMINISTRATOR,
    ROLES.LECTURER,
    ROLES.STUDENT,
  ]);
  assert.ok(User.schema.paths.accountStatus);
  assert.equal(User.schema.paths.isActive, undefined);
  assert.ok(User.schema.paths.phone);
  assert.ok(User.schema.paths.whatsappNumber);
  assert.ok(User.schema.paths.profileRevision);
});
