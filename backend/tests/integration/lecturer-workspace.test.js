import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import mongoose from 'mongoose';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { User } from '../../src/modules/authentication/models/user.model.js';
import { hashPassword } from '../../src/modules/authentication/security/passwords.js';
import { Department } from '../../src/modules/academic-foundation/models/department.model.js';
import { Batch } from '../../src/modules/academic-foundation/models/batch.model.js';
import { AcademicYear } from '../../src/modules/academic-foundation/models/academic-year.model.js';
import { Semester } from '../../src/modules/academic-foundation/models/semester.model.js';
import { Subject } from '../../src/modules/academic-foundation/models/subject.model.js';
import { SubjectOffering } from '../../src/modules/academic-foundation/models/subject-offering.model.js';
import { LecturerAssignment } from '../../src/modules/academic-foundation/models/lecturer-assignment.model.js';
import { OfficialResource } from '../../src/modules/learning-environment/models/official-resource.model.js';
import { CalendarEvent } from '../../src/modules/notices-calendar/models/calendar-event.model.js';
import { Notification } from '../../src/modules/notifications/models/notification.model.js';
import { ROLES } from '../../src/shared/constants/roles.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-20';
process.env.NODE_ENV = 'test';

let app;

before(async () => {
  await startIsolatedMongo();
  const config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  config.auth.loginMaxAttempts = 100;
  app = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
    infrastructure: {
      email: { send: async () => ({ accepted: false, retryable: false, category: 'not_configured' }) },
      whatsapp: { send: async () => ({ accepted: false, retryable: false, category: 'not_configured' }) },
      storage: {
        putObject: async () => ({}),
        getObject: async () => ({ body: Buffer.from('') }),
      },
      malwareScanner: { scan: async () => ({ clean: true, status: 'clean' }) },
      queue: { enqueue: async () => ({ id: 'test-job' }) },
    },
  });
});

after(async () => {
  await stopIsolatedMongo();
});

beforeEach(async () => {
  await clearIsolatedMongo();
});

async function createUser({ role, email, departmentId, lecturerStatus }) {
  return User.create({
    role,
    email,
    displayName: email,
    accountStatus: 'ACTIVE',
    departmentId,
    passwordHash: await hashPassword('correcthorse', { minLength: 10 }),
    lecturerStatus: lecturerStatus ?? (role === ROLES.LECTURER ? 'VERIFIED' : 'NOT_APPLICABLE'),
  });
}

async function login(email) {
  const agent = request.agent(app);
  const csrf = await agent.get('/api/auth/csrf');
  const response = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf.body.data.csrfToken)
    .send({ identifier: email, password: 'correcthorse' });
  assert.equal(response.status, 200);
  return { agent, csrfToken: response.body.data.csrfToken };
}

async function seed() {
  const department = await Department.create({ code: 'ICT', name: 'Department of ICT' });
  const otherDept = await Department.create({ code: 'MGT', name: 'Management' });
  const batch = await Batch.create({ departmentId: department._id, code: '22', name: '22 batch' });
  const year = await AcademicYear.create({ departmentId: department._id, sequence: 1, name: 'Year 1' });
  const semester = await Semester.create({
    departmentId: department._id,
    academicYearId: year._id,
    sequence: 1,
    name: 'Semester 1',
  });
  const subjectA = await Subject.create({
    departmentId: department._id,
    code: 'ICT1233',
    name: 'Programming',
    credits: 3,
  });
  const subjectB = await Subject.create({
    departmentId: department._id,
    code: 'ICT2000',
    name: 'Networks',
    credits: 3,
  });
  const offeringA = await SubjectOffering.create({
    departmentId: department._id,
    subjectId: subjectA._id,
    batchId: batch._id,
    academicYearId: year._id,
    semesterId: semester._id,
  });
  const offeringB = await SubjectOffering.create({
    departmentId: department._id,
    subjectId: subjectB._id,
    batchId: batch._id,
    academicYearId: year._id,
    semesterId: semester._id,
  });
  const admin = await createUser({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'admin@example.test',
    departmentId: department._id,
  });
  const lecturerA = await createUser({
    role: ROLES.LECTURER,
    email: 'lecturer-a@example.test',
    departmentId: department._id,
  });
  const lecturerB = await createUser({
    role: ROLES.LECTURER,
    email: 'lecturer-b@example.test',
    departmentId: department._id,
  });
  const unverified = await createUser({
    role: ROLES.LECTURER,
    email: 'unverified@example.test',
    departmentId: department._id,
    lecturerStatus: 'UNVERIFIED',
  });
  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'student@example.test',
    departmentId: department._id,
  });
  const assignmentA = await LecturerAssignment.create({
    departmentId: department._id,
    lecturerUserId: lecturerA._id,
    subjectOfferingId: offeringA._id,
    assignedByUserId: admin._id,
  });
  await LecturerAssignment.create({
    departmentId: department._id,
    lecturerUserId: lecturerB._id,
    subjectOfferingId: offeringB._id,
    assignedByUserId: admin._id,
  });
  await LecturerAssignment.create({
    departmentId: department._id,
    lecturerUserId: unverified._id,
    subjectOfferingId: offeringA._id,
    assignedByUserId: admin._id,
  });
  await OfficialResource.create({
    departmentId: department._id,
    subjectOfferingId: offeringA._id,
    sectionId: new mongoose.Types.ObjectId(),
    createdByUserId: lecturerA._id,
    fileId: new mongoose.Types.ObjectId(),
    title: 'Week 1 notes',
    category: 'LECTURE',
    publicationState: 'PUBLISHED',
    sortOrder: 0,
    version: 1,
    publishedAt: new Date(),
  });
  await OfficialResource.create({
    departmentId: department._id,
    subjectOfferingId: offeringB._id,
    sectionId: new mongoose.Types.ObjectId(),
    createdByUserId: lecturerB._id,
    fileId: new mongoose.Types.ObjectId(),
    title: 'Secret draft',
    category: 'LECTURE',
    publicationState: 'DRAFT',
    sortOrder: 0,
    version: 1,
  });
  await CalendarEvent.create({
    title: 'Programming lab deadline',
    startsAt: new Date(Date.now() + 86400000),
    createdByUserId: lecturerA._id,
    departmentId: department._id,
    eventType: 'ASSIGNMENT_DEADLINE',
    publicationState: 'PUBLISHED',
    subjectOfferingId: offeringA._id,
  });
  await CalendarEvent.create({
    title: 'Networks hidden deadline',
    startsAt: new Date(Date.now() + 86400000),
    createdByUserId: lecturerB._id,
    departmentId: department._id,
    eventType: 'ASSIGNMENT_DEADLINE',
    publicationState: 'PUBLISHED',
    subjectOfferingId: offeringB._id,
  });
  await Notification.create({
    recipientUserId: lecturerA._id,
    type: 'RESOURCE_PUBLISHED',
    sourceModule: 'learning-environment',
    sourceId: 'r1',
    channel: 'IN_APP',
    status: 'SENT',
    idempotencyKey: `lw:${lecturerA._id}:r1`,
  });
  return {
    department,
    otherDept,
    offeringA,
    offeringB,
    lecturerA,
    lecturerB,
    assignmentA,
    student,
    admin,
  };
}

test('lecturer dashboard is assignment-scoped and caches privately', async () => {
  await seed();
  const session = await login('lecturer-a@example.test');
  const first = await session.agent.get('/api/lecturer/dashboard');
  assert.equal(first.status, 200);
  assert.equal(first.headers['cache-control'], 'private, no-store');
  assert.equal(first.body.data.summary.activeAssignments, 1);
  assert.ok(first.body.data.currentOfferings.some((item) => item.subjectCode === 'ICT1233'));
  assert.ok(first.body.data.currentOfferings.every((item) => item.subjectCode !== 'ICT2000'));
  assert.equal(first.body.data.currentOfferings[0].batchName, '22 batch');
  assert.equal(first.body.data.summary.publishedOfficialResources, 1);
  assert.ok(first.body.data.upcomingEvents.some((item) => item.title === 'Programming lab deadline'));
  assert.ok(first.body.data.upcomingEvents.every((item) => item.title !== 'Networks hidden deadline'));
  assert.equal(first.body.data.notifications.unreadCount, 1);
  assert.equal(first.body.data.cache.hit, false);
  const cached = await session.agent.get('/api/lecturer/dashboard');
  assert.equal(cached.body.data.cache.hit, true);
});

test('students and admins cannot use lecturer workspace APIs', async () => {
  await seed();
  const student = await login('student@example.test');
  const admin = await login('admin@example.test');
  assert.equal((await student.agent.get('/api/lecturer/dashboard')).status, 403);
  assert.equal((await student.agent.get('/api/lecturer/search?q=ICT')).status, 403);
  assert.equal((await admin.agent.get('/api/lecturer/dashboard')).status, 403);
  const lecturer = await login('lecturer-a@example.test');
  assert.equal((await lecturer.agent.get('/api/study-room/conversations')).status, 403);
  assert.equal((await lecturer.agent.get('/api/me/dashboard')).status, 403);
});

test('cross-offering IDOR is blocked and search cannot escape assignment scope', async () => {
  const { offeringB } = await seed();
  const lecturerA = await login('lecturer-a@example.test');
  const denied = await lecturerA.agent.get(`/api/lecturer/subject-offerings/${offeringB._id}`);
  assert.equal(denied.status, 403);
  const searchOwn = await lecturerA.agent.get('/api/lecturer/search?q=ICT');
  assert.equal(searchOwn.status, 200);
  assert.ok(searchOwn.body.data.offerings.some((item) => item.subjectCode === 'ICT1233'));
  assert.ok(searchOwn.body.data.offerings.every((item) => item.subjectCode !== 'ICT2000'));
  const secret = await lecturerA.agent.get('/api/lecturer/search?q=Secret');
  assert.equal(secret.body.data.resources.length, 0);
  const abuse = await lecturerA.agent.get('/api/lecturer/search?q=.*');
  assert.equal(abuse.status, 400);
  const queryHijack = await lecturerA.agent.get(`/api/lecturer/dashboard?lecturerId=${offeringB._id}`);
  assert.equal(queryHijack.status, 200);
  assert.ok(queryHijack.body.data.currentOfferings.every((item) => item.subjectCode !== 'ICT2000'));
});

test('inactive assignment becomes read-only and unverified lecturers cannot manage', async () => {
  const { assignmentA, offeringA } = await seed();
  assignmentA.isActive = false;
  assignmentA.revokedAt = new Date();
  await assignmentA.save();
  const lecturerA = await login('lecturer-a@example.test');
  const dash = await lecturerA.agent.get('/api/lecturer/dashboard?refresh=true');
  assert.equal(dash.status, 200);
  assert.equal(dash.body.data.summary.activeAssignments, 0);
  assert.equal(dash.body.data.historicalOfferings[0].canManage, false);
  const detail = await lecturerA.agent.get(`/api/lecturer/subject-offerings/${offeringA._id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.canManage, false);
  const unverified = await login('unverified@example.test');
  const uv = await unverified.agent.get('/api/lecturer/dashboard?refresh=true');
  assert.equal(uv.status, 200);
  assert.ok(uv.body.data.currentOfferings.every((item) => item.canManage === false) || uv.body.data.summary.activeAssignments === 0);
  assert.ok(uv.body.data.attention.some((item) => item.code === 'LECTURER_UNVERIFIED'));
});

test('lecturer workspace rejects result mutation, CA approval, and resource write aliases', async () => {
  await seed();
  const session = await login('lecturer-a@example.test');
  const approve = await session.agent
    .post('/api/lecturer/ca-recovery/approve')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ approved: true, lecturerId: 'LECTURER_B', subjectOfferingId: 'OFFERING_B' });
  assert.equal(approve.status, 403);
  const results = await session.agent
    .post('/api/lecturer/results')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ ownerId: 'OTHER', resultCode: 'A+' });
  assert.equal(results.status, 403);
  const write = await session.agent
    .post('/api/lecturer/assignments')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ title: 'bypass' });
  assert.equal(write.status, 403);
});
