import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
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
import { StudentAcademicContext } from '../../src/modules/academic-foundation/models/student-academic-context.model.js';
import { StudentAcademicHistory } from '../../src/modules/academic-foundation/models/student-academic-history.model.js';
import { AcademicResult } from '../../src/modules/results/models/academic-result.model.js';
import { IncompleteCa } from '../../src/modules/ca-recovery/models/incomplete-ca.model.js';
import { Notice } from '../../src/modules/notices-calendar/models/notice.model.js';
import { CalendarEvent } from '../../src/modules/notices-calendar/models/calendar-event.model.js';
import { Notification } from '../../src/modules/notifications/models/notification.model.js';
import { recalculateStudentGpa } from '../../src/modules/gpa-cgpa/index.js';
import { ROLES } from '../../src/shared/constants/roles.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-11';
process.env.NODE_ENV = 'test';

let app;
let blobs;

before(async () => {
  await startIsolatedMongo();
  const config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  config.auth.loginMaxAttempts = 100;
  blobs = new Map();
  app = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
    infrastructure: {
      email: { send: async () => ({ accepted: false, retryable: false, category: 'not_configured' }) },
      whatsapp: { send: async () => ({ accepted: false, retryable: false, category: 'not_configured' }) },
      storage: {
        putObject: async ({ key, body }) => {
          blobs.set(key, body);
          return {};
        },
        getObject: async ({ key }) => ({ body: blobs.get(key) || Buffer.from('') }),
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
  blobs = new Map();
});

async function createUser({ role, email, departmentId }) {
  return User.create({
    role,
    email,
    displayName: email,
    accountStatus: 'ACTIVE',
    departmentId,
    passwordHash: await hashPassword('correcthorse', { minLength: 10 }),
    lecturerStatus: role === ROLES.LECTURER ? 'VERIFIED' : 'NOT_APPLICABLE',
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
  const year2 = await AcademicYear.create({ departmentId: department._id, sequence: 2, name: 'Year 2' });
  const semester = await Semester.create({
    departmentId: department._id,
    academicYearId: year._id,
    sequence: 1,
    name: 'Semester 1',
  });
  const semester2 = await Semester.create({
    departmentId: department._id,
    academicYearId: year2._id,
    sequence: 1,
    name: 'Semester 1 Y2',
  });
  const subject = await Subject.create({
    departmentId: department._id,
    code: 'ICT1233',
    name: 'Programming',
    credits: 3,
  });
  const offering = await SubjectOffering.create({
    departmentId: department._id,
    subjectId: subject._id,
    batchId: batch._id,
    academicYearId: year._id,
    semesterId: semester._id,
  });
  const admin = await createUser({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'admin@example.test',
    departmentId: department._id,
  });
  const lecturer = await createUser({
    role: ROLES.LECTURER,
    email: 'lecturer@example.test',
    departmentId: department._id,
  });
  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'student@example.test',
    departmentId: department._id,
  });
  const otherStudent = await createUser({
    role: ROLES.STUDENT,
    email: 'other@example.test',
    departmentId: department._id,
  });
  await createUser({
    role: ROLES.STUDENT,
    email: 'mgt-student@example.test',
    departmentId: otherDept._id,
  });
  await LecturerAssignment.create({
    departmentId: department._id,
    lecturerUserId: lecturer._id,
    subjectOfferingId: offering._id,
    assignedByUserId: admin._id,
  });
  const context = await StudentAcademicContext.create({
    userId: student._id,
    departmentId: department._id,
    batchId: batch._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
  });
  await StudentAcademicContext.create({
    userId: otherStudent._id,
    departmentId: department._id,
    batchId: batch._id,
    registrationNumber: 'SEU/IS/22/ICT/002',
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
  });
  await StudentAcademicHistory.create({
    studentAcademicContextId: context._id,
    userId: student._id,
    academicYearId: year2._id,
    semesterId: semester2._id,
  });
  return { department, offering, subject, year, semester, year2, semester2, student, otherStudent, lecturer };
}

test('student can read and update permitted profile fields only', async () => {
  const { student } = await seed();
  const session = await login('student@example.test');
  const profile = await session.agent.get('/api/me/profile');
  assert.equal(profile.status, 200);
  assert.equal(profile.body.data.academicIdentity.registrationNumber, 'SEU/IS/22/ICT/001');
  assert.equal(profile.body.data.email, 'student@example.test');
  assert.equal(profile.body.data.passwordHash, undefined);

  const patched = await session.agent
    .patch('/api/me/profile')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ displayName: 'Ada <script>', phone: '0771234567', expectedRevision: 0 });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.data.displayName, 'Ada <script>');
  assert.equal(patched.body.data.phone, '+94771234567');
  assert.equal(patched.body.data.whatsappNumber, '+94771234567');
  assert.equal(patched.body.data.academicIdentity.registrationNumber, 'SEU/IS/22/ICT/001');

  const forbiddenReg = await session.agent
    .patch('/api/me/profile')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ registrationNumber: 'HACKED', expectedRevision: patched.body.data.profileRevision });
  assert.equal(forbiddenReg.status, 403);
  const forbiddenDept = await session.agent
    .patch('/api/me/profile')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ departmentId: String(student.departmentId), expectedRevision: patched.body.data.profileRevision });
  assert.equal(forbiddenDept.status, 403);
  const invalidPhone = await session.agent
    .patch('/api/me/profile')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ phone: 'abc', expectedRevision: patched.body.data.profileRevision });
  assert.equal(invalidPhone.status, 400);

  const first = await session.agent
    .patch('/api/me/profile')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ displayName: 'Ada One', expectedRevision: patched.body.data.profileRevision });
  assert.equal(first.status, 200);
  const stale = await session.agent
    .patch('/api/me/profile')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ displayName: 'Ada Two', expectedRevision: patched.body.data.profileRevision });
  assert.equal(stale.status, 409);
});

test('profile IDOR and lecturer student-only routes are denied', async () => {
  await seed();
  const student = await login('student@example.test');
  const other = await login('other@example.test');
  const lecturer = await login('lecturer@example.test');
  const hijack = await student.agent
    .patch('/api/me/profile')
    .set('X-CSRF-Token', student.csrfToken)
    .send({ userId: (await User.findOne({ email: 'other@example.test' }))._id, displayName: 'Nope' });
  assert.equal(hijack.status, 403);
  const otherDash = await other.agent.get('/api/me/dashboard');
  const mine = await student.agent.get('/api/me/dashboard');
  assert.equal(otherDash.status, 200);
  assert.equal(mine.status, 200);
  assert.notEqual(mine.body.data.academicContext.registrationNumber, otherDash.body.data.academicContext.registrationNumber);
  const stolenPerf = await student.agent.get('/api/me/performance?studentId=not-me');
  assert.equal(stolenPerf.status, 403);
  const lecturerDash = await lecturer.agent.get('/api/me/dashboard');
  assert.equal(lecturerDash.status, 403);
  const lecturerPerf = await lecturer.agent.get('/api/me/performance');
  assert.equal(lecturerPerf.status, 403);
  const lecturerProfile = await lecturer.agent.get('/api/me/profile');
  assert.equal(lecturerProfile.status, 200);
  const studyRoom = await lecturer.agent.get('/api/study-room/conversations');
  assert.equal(studyRoom.status, 403);
});

test('dashboard composes current context, notices, events, CA, and does not fake GPA', async () => {
  const { department, offering, subject, student, year, semester } = await seed();
  await Notice.create({
    departmentId: department._id,
    publisherUserId: (await User.findOne({ email: 'admin@example.test' }))._id,
    title: 'Welcome',
    body: 'Hello',
    publicationState: 'PUBLISHED',
    publishedAt: new Date(),
    targeting: { kind: 'ALL_STUDENTS' },
  });
  await CalendarEvent.create({
    title: 'Lab',
    startsAt: new Date(Date.now() + 86400000),
    createdByUserId: (await User.findOne({ email: 'lecturer@example.test' }))._id,
    departmentId: department._id,
    eventType: 'DEPARTMENT',
    publicationState: 'PUBLISHED',
  });
  await Notification.create({
    recipientUserId: student._id,
    type: 'NOTICE_PUBLISHED',
    sourceModule: 'notices-calendar',
    sourceId: 'n1',
    channel: 'IN_APP',
    status: 'SENT',
    idempotencyKey: `dash:${student._id}:n1`,
  });
  await IncompleteCa.create({
    studentUserId: student._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    subjectId: subject._id,
    subjectCode: 'ICT1233',
    academicYearId: year._id,
    semesterId: semester._id,
    academicResultId: new AcademicResult()._id,
    departmentId: department._id,
    status: 'OPEN',
  });
  const session = await login('student@example.test');
  const emptyGpa = await session.agent.get('/api/me/dashboard');
  assert.equal(emptyGpa.status, 200);
  assert.equal(emptyGpa.body.data.academicContext.registrationNumber, 'SEU/IS/22/ICT/001');
  assert.ok(emptyGpa.body.data.currentSubjects.some((item) => item.subjectCode === 'ICT1233'));
  assert.ok(emptyGpa.body.data.notices.some((item) => item.title === 'Welcome'));
  assert.ok(emptyGpa.body.data.upcomingEvents.some((item) => item.title === 'Lab'));
  assert.equal(emptyGpa.body.data.notifications.unreadCount, 1);
  assert.equal(emptyGpa.body.data.performance.available, false);
  assert.equal(emptyGpa.body.data.performance.gpa, null);
  assert.equal(emptyGpa.body.data.caRecovery.unresolvedConditions[0].subjectCode, 'ICT1233');
  assert.ok(offering);
});

test('authoritative GPA, repeat-subject update, E(CA), and history stay student-scoped', async () => {
  const { department, subject, student, year, semester, year2, semester2 } = await seed();
  const result = await AcademicResult.create({
    departmentId: department._id,
    studentUserId: student._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    subjectId: subject._id,
    subjectCode: 'ICT1233',
    studentAcademicYearId: year._id,
    studentSemesterId: semester._id,
    resultCode: 'E(CA)',
    isEca: true,
    version: 1,
  });
  await recalculateStudentGpa(student._id);
  const session = await login('student@example.test');
  const pending = await session.agent.get('/api/me/performance');
  assert.equal(pending.status, 200);
  assert.equal(pending.body.data.gpa.available, false);
  assert.equal(pending.body.data.pendingEcaCount, 1);

  result.resultCode = 'A';
  result.isEca = false;
  result.previousResultCode = 'E(CA)';
  result.version = 2;
  result.studentAcademicYearId = year2._id;
  result.studentSemesterId = semester2._id;
  await result.save();
  await recalculateStudentGpa(student._id);
  const updated = await session.agent.get('/api/me/dashboard?refresh=true');
  assert.equal(updated.body.data.performance.available, true);
  assert.equal(updated.body.data.performance.gpa, 4);
  const history = await session.agent.get('/api/me/academic-history');
  assert.equal(history.body.data.results.length, 1);
  assert.equal(history.body.data.results[0].resultCode, 'A');
  const other = await login('other@example.test');
  const otherPerf = await other.agent.get('/api/me/performance');
  assert.equal(otherPerf.body.data.gpa.available, false);
  assert.equal(otherPerf.body.data.subjects.length, 0);
});

test('profile image uses the file pipeline and rejects executables', async () => {
  await seed();
  const session = await login('student@example.test');
  const exe = await session.agent
    .post('/api/me/profile/photo')
    .set('X-CSRF-Token', session.csrfToken)
    .attach('file', Buffer.from('MZ executable'), 'virus.exe');
  assert.equal(exe.status, 415);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(32, 1),
  ]);
  const ok = await session.agent
    .post('/api/me/profile/photo')
    .set('X-CSRF-Token', session.csrfToken)
    .attach('file', png, 'avatar.png');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.hasProfileImage, true);
  const download = await session.agent.get('/api/me/profile/photo');
  assert.equal(download.status, 200);
  const other = await login('other@example.test');
  const stolen = await other.agent.get('/api/me/profile/photo');
  assert.equal(stolen.status, 404);
});
