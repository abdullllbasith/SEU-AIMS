import assert from 'node:assert/strict';
import test from 'node:test';
import { ROLES } from '../../src/shared/constants/roles.js';
import {
  canAccessStudyRoom,
  canModerateStudyRoom,
  canStudentUseConversation,
  canRenameFolder,
  canTransitionResource,
  isStudentDownloadable,
} from '../../src/modules/study-room/policies/study-room.policies.js';

const student = { userId: 's1', role: ROLES.STUDENT, departmentId: 'd1' };
const lecturer = { userId: 'l1', role: ROLES.LECTURER, departmentId: 'd1' };
const admin = { userId: 'a1', role: ROLES.DEPARTMENT_ADMINISTRATOR, departmentId: 'd1' };

test('ordinary Study Room access is student-only', () => {
  assert.equal(canAccessStudyRoom(student), true);
  assert.equal(canAccessStudyRoom(lecturer), false);
  assert.equal(canAccessStudyRoom(admin), false);
});

test('moderation is department-admin scoped and not a chat backdoor', () => {
  assert.equal(canModerateStudyRoom(admin, 'd1'), true);
  assert.equal(canModerateStudyRoom(admin, 'd2'), false);
  assert.equal(canModerateStudyRoom(lecturer, 'd1'), false);
  assert.equal(canModerateStudyRoom(student, 'd1'), false);
});

test('batch conversations require matching active academic context', () => {
  const conversation = { type: 'BATCH', status: 'ACTIVE', batchId: 'b1', departmentId: 'd1' };
  const context = { status: 'ACTIVE', batchId: 'b1', departmentId: 'd1' };
  assert.equal(canStudentUseConversation(conversation, context, 's1'), true);
  assert.equal(
    canStudentUseConversation(conversation, { ...context, batchId: 'b2' }, 's1'),
    false,
  );
});

test('private conversations require membership, not just a student role', () => {
  const conversation = {
    type: 'PRIVATE',
    status: 'ACTIVE',
    participantUserIds: ['s1', 's2'],
  };
  const context = { status: 'ACTIVE', batchId: 'b1', departmentId: 'd1' };
  assert.equal(canStudentUseConversation(conversation, context, 's1'), true);
  assert.equal(canStudentUseConversation(conversation, context, 's3'), false);
});

test('only the folder creator can rename or archive', () => {
  assert.equal(canRenameFolder({ createdByUserId: 's1' }, 's1'), true);
  assert.equal(canRenameFolder({ createdByUserId: 's1' }, 's2'), false);
});

test('resource state machine rejects impossible transitions', () => {
  assert.equal(canTransitionResource('SCANNING', 'AVAILABLE'), true);
  assert.equal(canTransitionResource('SCANNING', 'PENDING_REVIEW'), true);
  assert.equal(canTransitionResource('AVAILABLE', 'PENDING_REVIEW'), false);
  assert.equal(canTransitionResource('REJECTED', 'AVAILABLE'), false);
});

test('download requires available + safe file, not merely a database row', () => {
  assert.equal(
    isStudentDownloadable({ moderationState: 'AVAILABLE' }, { scanStatus: 'SAFE', availability: 'AVAILABLE' }),
    true,
  );
  assert.equal(
    isStudentDownloadable({ moderationState: 'PENDING_REVIEW' }, { scanStatus: 'SAFE', availability: 'UNAVAILABLE' }),
    false,
  );
  assert.equal(
    isStudentDownloadable({ moderationState: 'AVAILABLE', deletedAt: new Date() }, { scanStatus: 'SAFE', availability: 'AVAILABLE' }),
    false,
  );
});
