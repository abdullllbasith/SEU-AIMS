import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { createFileStorage } from '../../src/infrastructure/storage/file-storage.js';
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
import { AcademicResult } from '../../src/modules/results/models/academic-result.model.js';
import { IncompleteCa } from '../../src/modules/ca-recovery/models/incomplete-ca.model.js';
import { CaApplication } from '../../src/modules/ca-recovery/models/ca-application.model.js';
import { CaApplicationSubject } from '../../src/modules/ca-recovery/models/ca-application-subject.model.js';
import { CaExamNotice } from '../../src/modules/ca-recovery/models/ca-exam-notice.model.js';
import { CaSchedule } from '../../src/modules/ca-recovery/models/ca-schedule.model.js';
import { Notification } from '../../src/modules/notifications/models/notification.model.js';
import { syncIncompleteCaFromResult } from '../../src/modules/ca-recovery/services/eca-from-results.js';
import { notifyLecturersOfApproval } from '../../src/modules/ca-recovery/services/lecturer-notify.service.js';
import { backfillSubjectExamStates } from '../../src/modules/ca-recovery/services/reconciliation.service.js';
import { releaseDueNotifications } from '../../src/modules/notifications/services/dispatcher.service.js';
import { processNotificationDeliver } from '../../src/modules/notifications/services/delivery.service.js';
import { applyWhatsAppStatuses } from '../../src/modules/audit-security/services/webhook.service.js';
import { AuditEvent } from '../../src/modules/audit-security/index.js';
import { colomboLocalToUtc } from '../../src/shared/time/colombo.js';
import { ROLES } from '../../src/shared/constants/roles.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-09';
process.env.NODE_ENV = 'test';

const DAY = 24 * 3600_000;
let app;
let config;
let enqueued;

before(async () => {
  await startIsolatedMongo();
  config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  config.auth.loginMaxAttempts = 1000;
  // These flows make hundreds of API calls; the default 120/min limiter is not what is under test.
  config.api.rateLimitMax = 100_000;
  config.storage = {
    driver: 'local_dev',
    localPath: path.resolve(process.cwd(), '..', '.local-storage', `ca-notice-files-${process.pid}`),
  };
  enqueued = [];
  app = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
    infrastructure: {
      email: { send: async () => ({ accepted: false, provider: 'noop' }) },
      storage: createFileStorage({ config, backendRoot: process.cwd() }),
      malwareScanner: { scan: async () => ({ clean: true, status: 'clean' }) },
      queue: {
        enqueue: async (job) => {
          enqueued.push(job);
          return { id: job.jobId };
        },
      },
    },
  });
});

after(async () => {
  await stopIsolatedMongo();
});

beforeEach(async () => {
  await clearIsolatedMongo();
  enqueued.length = 0;
});

async function createUser({ role, email, departmentId }) {
  return User.create({
    role,
    email,
    displayName: email,
    accountStatus: 'ACTIVE',
    departmentId,
    whatsappNumber: role === ROLES.STUDENT ? `9477${Math.floor(1000000 + Math.random() * 8999999)}` : undefined,
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

function post(session, url, body = {}) {
  return session.agent.post(url).set('X-CSRF-Token', session.csrfToken).send(body);
}

/** Colombo wall-clock date string N days from now, used with startTime "09:00". */
function colomboDate(daysAhead) {
  return new Date(Date.now() + daysAhead * DAY + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Department with subjects A, B, C (offerings OA, OB, OC):
 *   L1 teaches A and B, L2 teaches C, L3 had a revoked assignment on A.
 *   S1 owes A, B and C (one application, three subjects); S2 owes only B.
 */
async function setup() {
  const department = await Department.create({ code: 'ICT', name: 'Department of ICT' });
  const otherDepartment = await Department.create({ code: 'BST', name: 'Department of BST' });
  const batch = await Batch.create({ departmentId: department._id, code: '22', name: '22 batch' });
  const year = await AcademicYear.create({ departmentId: department._id, sequence: 1, name: 'Year 1' });
  const semester = await Semester.create({
    departmentId: department._id,
    academicYearId: year._id,
    sequence: 1,
    name: 'Semester 1',
  });
  const subjects = {};
  const offerings = {};
  for (const [key, code] of [
    ['A', 'ICT1001'],
    ['B', 'ICT1002'],
    ['C', 'ICT1003'],
  ]) {
    subjects[key] = await Subject.create({
      departmentId: department._id,
      code,
      name: `Subject ${key}`,
      credits: 3,
    });
    offerings[key] = await SubjectOffering.create({
      departmentId: department._id,
      subjectId: subjects[key]._id,
      batchId: batch._id,
      academicYearId: year._id,
      semesterId: semester._id,
    });
  }
  const admin = await createUser({ role: ROLES.DEPARTMENT_ADMINISTRATOR, email: 'admin@example.test', departmentId: department._id });
  const otherAdmin = await createUser({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'other-admin@example.test',
    departmentId: otherDepartment._id,
  });
  const l1 = await createUser({ role: ROLES.LECTURER, email: 'l1@example.test', departmentId: department._id });
  const l2 = await createUser({ role: ROLES.LECTURER, email: 'l2@example.test', departmentId: department._id });
  const l3 = await createUser({ role: ROLES.LECTURER, email: 'l3@example.test', departmentId: department._id });
  const s1 = await createUser({ role: ROLES.STUDENT, email: 's1@example.test', departmentId: department._id });
  const s2 = await createUser({ role: ROLES.STUDENT, email: 's2@example.test', departmentId: department._id });
  const assign = (lecturer, offering, extra = {}) =>
    LecturerAssignment.create({
      departmentId: department._id,
      lecturerUserId: lecturer._id,
      subjectOfferingId: offering._id,
      assignedByUserId: admin._id,
      ...extra,
    });
  await assign(l1, offerings.A);
  await assign(l1, offerings.B);
  await assign(l2, offerings.C);
  await assign(l3, offerings.A, { isActive: false, revokedAt: new Date() });
  const students = [
    [s1, 'SEU/IS/22/ICT/001'],
    [s2, 'SEU/IS/22/ICT/002'],
  ];
  for (const [student, registrationNumber] of students) {
    await StudentAcademicContext.create({
      userId: student._id,
      departmentId: department._id,
      batchId: batch._id,
      registrationNumber,
      currentAcademicYearId: year._id,
      currentSemesterId: semester._id,
    });
  }
  async function condition(student, registrationNumber, key) {
    const result = await AcademicResult.create({
      departmentId: department._id,
      studentUserId: student._id,
      registrationNumber,
      subjectId: subjects[key]._id,
      subjectCode: subjects[key].code,
      studentAcademicYearId: year._id,
      studentSemesterId: semester._id,
      resultCode: 'E(CA)',
      isEca: true,
      committedByUserId: admin._id,
    });
    return { result, condition: await syncIncompleteCaFromResult(result) };
  }
  const s1A = await condition(s1, 'SEU/IS/22/ICT/001', 'A');
  const s1B = await condition(s1, 'SEU/IS/22/ICT/001', 'B');
  const s1C = await condition(s1, 'SEU/IS/22/ICT/001', 'C');
  const s2B = await condition(s2, 'SEU/IS/22/ICT/002', 'B');
  return {
    department,
    year,
    semester,
    subjects,
    offerings,
    users: { admin, otherAdmin, l1, l2, l3, s1, s2 },
    conditions: { s1A, s1B, s1C, s2B },
  };
}

async function applyAndApprove({ world, adminSession, studentSession, conditionList }) {
  const created = await post(studentSession, '/api/ca/applications', {
    academicYearId: String(world.year._id),
    semesterId: String(world.semester._id),
    incompleteCaIds: conditionList.map((item) => String(item.condition._id)),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const applicationId = created.body.data.applicationId;
  const submitted = await post(studentSession, `/api/ca/applications/${applicationId}/submit`);
  assert.equal(submitted.status, 200);
  const scanned = await post(adminSession, '/api/ca/admin/scan-verify', {
    receipt: applicationId,
    inspectionConfirmed: true,
  });
  assert.equal(scanned.status, 200, JSON.stringify(scanned.body));
  const approved = await post(adminSession, `/api/ca/admin/applications/${applicationId}/approve`);
  assert.equal(approved.status, 200);
  return applicationId;
}

async function openWindow(world, admin) {
  const response = await post(admin, '/api/ca/admin/windows', {
    academicYearId: String(world.year._id),
    semesterId: String(world.semester._id),
    opensAt: new Date(Date.now() - 3600_000).toISOString(),
    closesAt: new Date(Date.now() + DAY).toISOString(),
    published: true,
  });
  assert.equal(response.status, 201);
}

async function fullSetup() {
  const world = await setup();
  const sessions = {
    admin: await login('admin@example.test'),
    otherAdmin: await login('other-admin@example.test'),
    l1: await login('l1@example.test'),
    l2: await login('l2@example.test'),
    l3: await login('l3@example.test'),
    s1: await login('s1@example.test'),
    s2: await login('s2@example.test'),
  };
  await openWindow(world, sessions.admin);
  const app1 = await applyAndApprove({
    world,
    adminSession: sessions.admin,
    studentSession: sessions.s1,
    conditionList: [world.conditions.s1A, world.conditions.s1B, world.conditions.s1C],
  });
  const app2 = await applyAndApprove({
    world,
    adminSession: sessions.admin,
    studentSession: sessions.s2,
    conditionList: [world.conditions.s2B],
  });
  return { world, sessions, app1, app2 };
}

function publish(session, offering, extra = {}) {
  return post(session, '/api/ca/lecturer/exam-notices', {
    subjectOfferingId: String(offering._id),
    date: colomboDate(10),
    startTime: '09:00',
    endTime: '11:00',
    venue: 'Main Hall',
    ...extra,
  });
}

async function linkOf(applicationId, condition) {
  const application = await CaApplication.findOne({ applicationId });
  return CaApplicationSubject.findOne({ applicationId: application._id, incompleteCaId: condition.condition._id });
}

/** Treat the immediate exam-scheduled deliveries as done so sweep counts only reflect reminders. */
const settleExamMessages = () =>
  Notification.updateMany({ type: 'CA_EXAM_SCHEDULED', channel: { $ne: 'IN_APP' } }, { $set: { status: 'SENT' } });

const statusOf = async (applicationId) => (await CaApplication.findOne({ applicationId })).workflowStatus;

test('scan verify: QR URL, token and manual ID; explicit inspection; department scoped; idempotent; never approves', async () => {
  const world = await setup();
  const admin = await login('admin@example.test');
  const otherAdmin = await login('other-admin@example.test');
  const s1 = await login('s1@example.test');
  await openWindow(world, admin);
  const forms = [];
  // Three separate cycles are needed to try each input style, so use S1 and S2 with different shapes.
  const s2 = await login('s2@example.test');
  for (const [session, list] of [
    [s1, [world.conditions.s1A]],
    [s2, [world.conditions.s2B]],
  ]) {
    const created = await post(session, '/api/ca/applications', {
      academicYearId: String(world.year._id),
      semesterId: String(world.semester._id),
      incompleteCaIds: list.map((item) => String(item.condition._id)),
    });
    await post(session, `/api/ca/applications/${created.body.data.applicationId}/submit`);
    forms.push(created.body.data.applicationId);
  }
  const [firstId, secondId] = forms;
  const first = await CaApplication.findOne({ applicationId: firstId });

  const noConfirmation = await post(admin, '/api/ca/admin/scan-verify', { receipt: firstId });
  assert.equal(noConfirmation.status, 400);
  assert.match(JSON.stringify(noConfirmation.body), /inspected the printed form and the physical HOD signature/);
  assert.equal((await CaApplication.findOne({ applicationId: firstId })).physicalVerificationStatus, 'AWAITING_PHYSICAL');

  const emptyReceipt = await post(admin, '/api/ca/admin/scan-verify', { inspectionConfirmed: true });
  assert.equal(emptyReceipt.status, 400);

  const crossDepartment = await post(otherAdmin, '/api/ca/admin/scan-verify', {
    receipt: firstId,
    inspectionConfirmed: true,
  });
  assert.equal(crossDepartment.status, 404);
  assert.equal((await CaApplication.findOne({ applicationId: firstId })).physicalVerificationStatus, 'AWAITING_PHYSICAL');

  const unknown = await post(admin, '/api/ca/admin/scan-verify', { receipt: 'CA-99XXX999-Y9S9', inspectionConfirmed: true });
  assert.equal(unknown.status, 404);

  const byUrl = await post(admin, '/api/ca/admin/scan-verify', {
    receipt: `http://localhost:3001/api/ca/verify/${first.qrVerificationToken}`,
    inspectionConfirmed: true,
  });
  assert.equal(byUrl.status, 200);
  assert.equal(byUrl.body.data.physicalVerificationStatus, 'PHYSICALLY_VERIFIED');
  assert.equal(byUrl.body.data.workflowStatus, 'UNDER_VERIFICATION', 'a scan never approves');
  assert.equal(byUrl.body.data.alreadyVerified, false);
  const stored = await CaApplication.findOne({ applicationId: firstId });
  assert.equal(String(stored.verifiedByAdminUserId), String(world.users.admin._id));
  assert.ok(stored.physicallyVerifiedAt);
  assert.equal(stored.physicalInspection.method, 'QR_SCAN');
  assert.equal(String(stored.physicalInspection.confirmedByUserId), String(world.users.admin._id));
  assert.equal(
    await AuditEvent.countDocuments({ action: 'ca.application.verify', entityId: String(stored._id) }),
    1,
  );

  const repeat = await post(admin, '/api/ca/admin/scan-verify', { receipt: firstId, inspectionConfirmed: true });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.data.alreadyVerified, true);
  assert.equal(
    await AuditEvent.countDocuments({ action: 'ca.application.verify', entityId: String(stored._id) }),
    1,
    'a repeated scan writes no second verification',
  );

  const second = await CaApplication.findOne({ applicationId: secondId });
  const byToken = await post(admin, '/api/ca/admin/scan-verify', {
    receipt: second.qrVerificationToken,
    inspectionConfirmed: true,
  });
  assert.equal(byToken.status, 200);
  assert.equal((await CaApplication.findOne({ applicationId: secondId })).physicalInspection.method, 'QR_SCAN');

  // Approval stays a separate admin action.
  const approved = await post(admin, `/api/ca/admin/applications/${firstId}/approve`);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.workflowStatus, 'APPROVED');
});

test('manual Application ID verification records MANUAL_ID', async () => {
  const world = await setup();
  const admin = await login('admin@example.test');
  const s2 = await login('s2@example.test');
  await openWindow(world, admin);
  const created = await post(s2, '/api/ca/applications', {
    academicYearId: String(world.year._id),
    semesterId: String(world.semester._id),
    incompleteCaIds: [String(world.conditions.s2B.condition._id)],
  });
  const applicationId = created.body.data.applicationId;
  await post(s2, `/api/ca/applications/${applicationId}/submit`);
  const lower = await post(admin, '/api/ca/admin/scan-verify', {
    receipt: applicationId.toLowerCase(),
    inspectionConfirmed: true,
  });
  assert.equal(lower.status, 200);
  assert.equal((await CaApplication.findOne({ applicationId })).physicalInspection.method, 'MANUAL_ID');
});

test('approval makes each subject schedulable and notifies only the active lecturers of those offerings', async () => {
  const { world, sessions, app1, app2 } = await fullSetup();
  const { l1, l2, l3, s1, s2 } = world.users;
  const lecturerNotices = await Notification.find({ type: 'CA_LECTURER_APPROVED_STUDENT', channel: 'IN_APP' });
  const byRecipient = (user) => lecturerNotices.filter((item) => String(item.recipientUserId) === String(user._id));
  // S1: A and B -> L1 (two distinct notices), C -> L2. S2: B -> L1. L3 was revoked.
  assert.equal(byRecipient(l1).length, 3);
  assert.equal(new Set(byRecipient(l1).map((item) => item.sourceId)).size, 3);
  assert.equal(byRecipient(l2).length, 1);
  assert.equal(byRecipient(l3).length, 0);
  assert.equal(
    await Notification.countDocuments({ type: 'CA_LECTURER_APPROVED_STUDENT', recipientUserId: { $in: [s1._id, s2._id] } }),
    0,
  );
  assert.equal(await Notification.countDocuments({ type: 'CA_LECTURER_APPROVED_STUDENT', channel: 'WHATSAPP' }), 0);

  // A repeated notification pass creates no duplicates.
  const application = await CaApplication.findOne({ applicationId: app1 });
  const links = await CaApplicationSubject.find({ applicationId: application._id });
  await notifyLecturersOfApproval({ application, links, infrastructure: app.get('infrastructure') });
  assert.equal(await Notification.countDocuments({ type: 'CA_LECTURER_APPROVED_STUDENT', channel: 'IN_APP' }), 4);

  for (const link of links) {
    assert.equal(link.examStatus, 'READY_TO_SCHEDULE');
  }
  assert.equal(await statusOf(app1), 'APPROVED');
  assert.equal(await statusOf(app2), 'APPROVED');

  // Only approved students appear, and only for the lecturer's own offerings.
  const l1List = await sessions.l1.agent.get('/api/ca/lecturer/eligible-students');
  assert.equal(l1List.status, 200);
  assert.deepEqual(
    l1List.body.data.items.map((item) => `${item.registrationNumber}:${item.subjectCode}`).sort(),
    ['SEU/IS/22/ICT/001:ICT1001', 'SEU/IS/22/ICT/001:ICT1002', 'SEU/IS/22/ICT/002:ICT1002'],
  );
  const l2List = await sessions.l2.agent.get('/api/ca/lecturer/eligible-students');
  assert.deepEqual(l2List.body.data.items.map((item) => item.subjectCode), ['ICT1003']);
  const l3List = await sessions.l3.agent.get('/api/ca/lecturer/eligible-students');
  assert.equal(l3List.body.data.items.length, 0);
});

test('unapproved students never appear in the lecturer workspace', async () => {
  const world = await setup();
  const admin = await login('admin@example.test');
  const l1 = await login('l1@example.test');
  const s1 = await login('s1@example.test');
  await openWindow(world, admin);
  const created = await post(s1, '/api/ca/applications', {
    academicYearId: String(world.year._id),
    semesterId: String(world.semester._id),
    incompleteCaIds: [String(world.conditions.s1A.condition._id)],
  });
  await post(s1, `/api/ca/applications/${created.body.data.applicationId}/submit`);
  await post(admin, '/api/ca/admin/scan-verify', { receipt: created.body.data.applicationId, inspectionConfirmed: true });
  // Physically verified but not yet approved by the admin.
  const list = await l1.agent.get('/api/ca/lecturer/eligible-students');
  assert.equal(list.body.data.items.length, 0);
  assert.equal(await Notification.countDocuments({ type: 'CA_LECTURER_APPROVED_STUDENT' }), 0);
});

test('subject-level notices: publish, cancel, reschedule and complete stay independent per subject', async () => {
  const { world, sessions, app1, app2 } = await fullSetup();
  const { offerings, conditions, users } = world;

  // L2 cannot publish for L1's offering; a revoked lecturer cannot either.
  assert.equal((await publish(sessions.l2, offerings.A)).status, 403);
  assert.equal((await publish(sessions.l3, offerings.A)).status, 403);
  assert.equal((await publish(sessions.l1, offerings.A, { venue: '' })).status, 400);
  assert.equal((await publish(sessions.l1, offerings.A, { date: colomboDate(-2) })).status, 400);

  // L1 publishes A: only S1 is affected.
  const noticeA = await publish(sessions.l1, offerings.A);
  assert.equal(noticeA.status, 201, JSON.stringify(noticeA.body));
  assert.equal(noticeA.body.data.studentCount, 1);
  assert.equal(noticeA.body.data.timezone, 'Asia/Colombo');
  const noticeAId = noticeA.body.data.id;
  assert.equal((await linkOf(app1, conditions.s1A)).examStatus, 'SCHEDULED');
  assert.equal((await linkOf(app1, conditions.s1B)).examStatus, 'READY_TO_SCHEDULE');
  assert.equal((await linkOf(app1, conditions.s1C)).examStatus, 'READY_TO_SCHEDULE');
  assert.equal((await linkOf(app2, conditions.s2B)).examStatus, 'READY_TO_SCHEDULE');
  assert.equal(await statusOf(app1), 'SCHEDULED');
  assert.equal(await statusOf(app2), 'APPROVED');

  // The current batch hears about the notice too (S2 is in the batch, has no approved application yet).
  const batchForA = await Notification.find({
    type: 'CA_EXAM_SCHEDULED',
    'guardRef.noticeId': noticeAId,
    recipientUserId: users.s2._id,
  });
  assert.equal(batchForA.length, 3, 'in-app, email and WhatsApp for the current-batch student');
  assert.ok(batchForA.every((item) => item.guardRef.audience === 'BATCH'));
  const scheduledForA = await Notification.find({
    type: 'CA_EXAM_SCHEDULED',
    'guardRef.noticeId': noticeAId,
    recipientUserId: users.s1._id,
  });
  assert.equal(scheduledForA.length, 3);
  assert.deepEqual([...new Set(scheduledForA.map((item) => String(item.recipientUserId)))], [String(users.s1._id)]);
  assert.deepEqual(scheduledForA.map((item) => item.channel).sort(), ['EMAIL', 'IN_APP', 'WHATSAPP']);
  assert.equal(scheduledForA.find((item) => item.channel === 'IN_APP').status, 'SENT');
  assert.match(scheduledForA[0].body, /ICT1001/);
  assert.match(scheduledForA[0].body, /Main Hall/);
  assert.match(scheduledForA[0].body, /09:00/);
  assert.equal(
    await Notification.countDocuments({ type: 'CA_REMINDER', 'guardRef.noticeId': noticeAId, recipientUserId: users.s1._id }),
    9,
    '7, 3 and 1 day reminders on three channels',
  );
  // S2 has no application, but is in the current batch: the notice and its reminders reach them as a batch student.
  assert.equal(
    await Notification.countDocuments({ recipientUserId: users.s2._id, type: 'CA_EXAM_SCHEDULED', 'guardRef.noticeId': noticeAId }),
    3,
  );
  assert.equal(
    await Notification.countDocuments({ recipientUserId: users.s2._id, type: 'CA_REMINDER', 'guardRef.noticeId': noticeAId }),
    9,
  );
  assert.equal(await AuditEvent.countDocuments({ action: 'ca.exam-notice.publish' }), 1);

  // A second notice for the same offering is refused while one is published.
  assert.equal((await publish(sessions.l1, offerings.A)).status, 409);

  // L1 publishes B: S1 and S2 are both scheduled, each with their own notifications.
  const noticeB = await publish(sessions.l1, offerings.B, { venue: 'Lab 2' });
  assert.equal(noticeB.status, 201);
  assert.equal(noticeB.body.data.studentCount, 2);
  const noticeBId = noticeB.body.data.id;
  assert.equal(await statusOf(app2), 'SCHEDULED');
  assert.equal(await Notification.countDocuments({ type: 'CA_EXAM_SCHEDULED', 'guardRef.noticeId': noticeBId }), 6);

  // L2 publishes C.
  const noticeC = await publish(sessions.l2, offerings.C, { venue: 'Hall 3' });
  assert.equal(noticeC.status, 201);
  const noticeCId = noticeC.body.data.id;

  // Cancelling A leaves B and C (same application) untouched.
  const reminderCountB = await Notification.countDocuments({ 'guardRef.noticeId': noticeBId, type: 'CA_REMINDER', status: 'SCHEDULED' });
  const reminderCountC = await Notification.countDocuments({ 'guardRef.noticeId': noticeCId, type: 'CA_REMINDER', status: 'SCHEDULED' });
  assert.equal(reminderCountB, 18);
  assert.equal(reminderCountC, 18, 'S1 as applicant plus S2 as a current-batch student');
  const cancelledA = await post(sessions.l1, `/api/ca/lecturer/exam-notices/${noticeAId}/cancel`, { reason: 'Hall unavailable' });
  assert.equal(cancelledA.status, 200);
  assert.equal((await linkOf(app1, conditions.s1A)).examStatus, 'READY_TO_SCHEDULE');
  assert.equal((await linkOf(app1, conditions.s1B)).examStatus, 'SCHEDULED');
  assert.equal((await linkOf(app1, conditions.s1C)).examStatus, 'SCHEDULED');
  assert.equal(await statusOf(app1), 'SCHEDULED', 'cancelling one subject must not move the application back');
  assert.equal(await Notification.countDocuments({ 'guardRef.noticeId': noticeAId, status: { $in: ['SCHEDULED', 'PENDING'] } }), 0);
  assert.equal(
    await Notification.countDocuments({ 'guardRef.noticeId': noticeBId, type: 'CA_REMINDER', status: 'SCHEDULED' }),
    reminderCountB,
  );
  assert.equal(
    await Notification.countDocuments({ 'guardRef.noticeId': noticeCId, type: 'CA_REMINDER', status: 'SCHEDULED' }),
    reminderCountC,
  );
  assert.equal(await Notification.countDocuments({ type: 'CA_EXAM_CANCELLED', recipientUserId: users.s1._id }), 3);
  assert.equal(await Notification.countDocuments({ type: 'CA_EXAM_CANCELLED', recipientUserId: users.s2._id }), 3, 'the current batch is told too');
  const keptNotice = await CaExamNotice.findById(noticeAId);
  assert.equal(keptNotice.status, 'CANCELLED');
  assert.equal(keptNotice.history.length, 2);
  const keptRows = await CaSchedule.find({ examNoticeId: noticeAId });
  assert.equal(keptRows.length, 1);
  assert.equal(keptRows[0].status, 'CANCELLED', 'cancelled schedule history is preserved');
  assert.equal((await post(sessions.l1, `/api/ca/lecturer/exam-notices/${noticeAId}/cancel`, { reason: 'again' })).status, 400);

  // Rescheduling C supersedes generation 1 and creates generation 2 for S1 only.
  const sameTime = await post(sessions.l2, `/api/ca/lecturer/exam-notices/${noticeCId}/reschedule`, {});
  assert.equal(sameTime.status, 400);
  const rescheduledC = await post(sessions.l2, `/api/ca/lecturer/exam-notices/${noticeCId}/reschedule`, {
    date: colomboDate(12),
    startTime: '13:30',
    venue: 'Hall 4',
  });
  assert.equal(rescheduledC.status, 200, JSON.stringify(rescheduledC.body));
  assert.equal(rescheduledC.body.data.generation, 2);
  assert.equal(rescheduledC.body.data.history.length, 2);
  const rowsC = await CaSchedule.find({ examNoticeId: noticeCId }).sort({ generation: 1 });
  assert.deepEqual(rowsC.map((row) => `${row.generation}:${row.status}`), ['1:SUPERSEDED', '2:ACTIVE']);
  assert.equal(
    await Notification.countDocuments({ 'guardRef.noticeId': noticeCId, 'guardRef.generation': 1, status: { $in: ['SCHEDULED', 'PENDING'] } }),
    0,
    'generation 1 reminders are cancelled',
  );
  const gen2Reminders = await Notification.find({ 'guardRef.noticeId': noticeCId, 'guardRef.generation': 2, type: 'CA_REMINDER' });
  assert.equal(gen2Reminders.length, 18, 'S1 as applicant plus S2 as a current-batch student');
  assert.deepEqual(
    [...new Set(gen2Reminders.map((item) => String(item.recipientUserId)))].sort(),
    [String(users.s1._id), String(users.s2._id)].sort(),
  );
  assert.equal(await Notification.countDocuments({ type: 'CA_EXAM_RESCHEDULED' }), 6, 'applicant and current-batch student');
  assert.equal((await linkOf(app1, conditions.s1C)).examStatus, 'SCHEDULED');
  assert.equal((await post(sessions.l1, `/api/ca/lecturer/exam-notices/${noticeCId}/reschedule`, { venue: 'Elsewhere' })).status, 403);

  // Completion is per subject. Several of L1's subjects in one application need an explicit choice.
  const ambiguous = await post(sessions.l1, `/api/ca/lecturer/applications/${app1}/complete`, {});
  assert.equal(ambiguous.status, 400);
  assert.equal((await post(sessions.l2, `/api/ca/lecturer/subjects/${(await linkOf(app1, conditions.s1B))._id}/complete`)).status, 403);

  const completeC = await post(sessions.l2, `/api/ca/lecturer/subjects/${(await linkOf(app1, conditions.s1C))._id}/complete`);
  assert.equal(completeC.status, 200);
  assert.equal(completeC.body.data.examStatus, 'COMPLETED');
  assert.equal(await statusOf(app1), 'SCHEDULED', 'completing one subject does not complete the application');
  assert.equal((await linkOf(app1, conditions.s1B)).examStatus, 'SCHEDULED');

  const completeB = await post(sessions.l1, `/api/ca/lecturer/subjects/${(await linkOf(app1, conditions.s1B))._id}/complete`);
  assert.equal(completeB.status, 200);
  assert.equal(await statusOf(app1), 'SCHEDULED', 'A is still waiting for a new notice, so the application is not complete');
  assert.equal(await statusOf(app2), 'SCHEDULED', "S2's application is unaffected by S1's completion");
  assert.equal(
    await Notification.countDocuments({ 'guardRef.linkId': String((await linkOf(app1, conditions.s1B))._id), type: 'CA_REMINDER', status: { $in: ['SCHEDULED', 'PENDING'] } }),
    0,
    'completing a subject cancels its remaining reminders',
  );
  assert.equal(
    await Notification.countDocuments({ 'guardRef.linkId': String((await linkOf(app2, conditions.s2B))._id), type: 'CA_REMINDER', status: 'SCHEDULED' }),
    9,
    "S2's reminders for the same offering are untouched",
  );
  assert.equal((await post(sessions.l1, `/api/ca/lecturer/subjects/${(await linkOf(app1, conditions.s1B))._id}/complete`)).status, 400);

  // Republishing A attaches S1 again; completing it completes the whole application.
  const republished = await publish(sessions.l1, offerings.A);
  assert.equal(republished.status, 201);
  assert.notEqual(republished.body.data.id, noticeAId);
  assert.equal(await statusOf(app1), 'SCHEDULED');
  const completeA = await post(sessions.l1, `/api/ca/lecturer/subjects/${(await linkOf(app1, conditions.s1A))._id}/complete`);
  assert.equal(completeA.status, 200);
  assert.equal(completeA.body.data.workflowStatus, 'COMPLETED');
  assert.equal(await statusOf(app2), 'SCHEDULED');
  const completeS2 = await post(sessions.l1, `/api/ca/lecturer/subjects/${(await linkOf(app2, conditions.s2B))._id}/complete`);
  assert.equal(completeS2.body.data.workflowStatus, 'COMPLETED');

  // Official results are untouched by completion.
  const result = await AcademicResult.findById(conditions.s1A.result._id);
  assert.equal(result.resultCode, 'E(CA)');
  assert.equal(result.isEca, true);
});

test('cancelling the last scheduled subject returns the application to APPROVED', async () => {
  const { world, sessions, app2 } = await fullSetup();
  const notice = await publish(sessions.l1, world.offerings.B);
  assert.equal(notice.status, 201);
  assert.equal(await statusOf(app2), 'SCHEDULED');
  const cancelled = await post(sessions.l1, `/api/ca/lecturer/exam-notices/${notice.body.data.id}/cancel`, {
    reason: 'Clash with another paper',
  });
  assert.equal(cancelled.status, 200);
  assert.equal(await statusOf(app2), 'APPROVED');
  assert.equal((await linkOf(app2, world.conditions.s2B)).examStatus, 'READY_TO_SCHEDULE');
});

test('a student approved after the notice was published joins it and gets its reminders', async () => {
  const world = await setup();
  const sessions = {
    admin: await login('admin@example.test'),
    l1: await login('l1@example.test'),
    s1: await login('s1@example.test'),
    s2: await login('s2@example.test'),
  };
  await openWindow(world, sessions.admin);
  const app1 = await applyAndApprove({
    world,
    adminSession: sessions.admin,
    studentSession: sessions.s1,
    conditionList: [world.conditions.s1B],
  });
  const notice = await publish(sessions.l1, world.offerings.B);
  assert.equal(notice.body.data.studentCount, 1);
  const app2 = await applyAndApprove({
    world,
    adminSession: sessions.admin,
    studentSession: sessions.s2,
    conditionList: [world.conditions.s2B],
  });
  assert.equal((await linkOf(app2, world.conditions.s2B)).examStatus, 'SCHEDULED');
  assert.equal(await statusOf(app2), 'SCHEDULED');
  assert.equal(await statusOf(app1), 'SCHEDULED');
  assert.equal(
    await Notification.countDocuments({ recipientUserId: world.users.s2._id, type: 'CA_EXAM_SCHEDULED' }),
    3,
  );
  assert.equal(
    await Notification.countDocuments({ recipientUserId: world.users.s2._id, type: 'CA_REMINDER' }),
    9,
  );
  const listed = await sessions.l1.agent.get('/api/ca/lecturer/exam-notices');
  assert.equal(listed.body.data.items[0].studentCount, 2);
});

test('legacy per-application endpoints delegate to the notice workflow', async () => {
  const { world, sessions, app1 } = await fullSetup();
  const link = await linkOf(app1, world.conditions.s1A);
  const legacy = await post(sessions.l1, '/api/ca/lecturer/schedules', {
    applicationId: app1,
    incompleteCaId: String(world.conditions.s1A.condition._id),
    subjectOfferingId: String(world.offerings.A._id),
    scheduledAt: new Date(colomboLocalToUtc(colomboDate(10), '09:00')).toISOString(),
    venue: 'Lab 9',
  });
  assert.equal(legacy.status, 201, JSON.stringify(legacy.body));
  assert.equal(legacy.body.data.deprecated, true);
  assert.ok(legacy.body.data.examNoticeId);
  assert.equal(await Notification.countDocuments({ type: 'CA_EXAM_SCHEDULED', 'guardRef.linkId': String(link._id) }), 3);
  assert.equal(await Notification.countDocuments({ type: 'CA_REMINDER', 'guardRef.linkId': String(link._id) }), 9);
  // Only the selected student's subject was scheduled; S1's B and S2's B were not.
  assert.equal((await linkOf(app1, world.conditions.s1B)).examStatus, 'READY_TO_SCHEDULE');
  const cancelLegacy = await post(sessions.l1, `/api/ca/lecturer/schedules/${legacy.body.data.id}/cancel`);
  assert.equal(cancelLegacy.status, 409);
  const again = await post(sessions.l1, '/api/ca/lecturer/schedules', {
    applicationId: app1,
    incompleteCaId: String(world.conditions.s1A.condition._id),
    subjectOfferingId: String(world.offerings.A._id),
    scheduledAt: new Date(colomboLocalToUtc(colomboDate(10), '09:00')).toISOString(),
    venue: 'Lab 9',
  });
  assert.equal(again.status, 400);
});

test('an official result resolves only its own subject and cancels that subject’s reminders', async () => {
  const { world, sessions, app1 } = await fullSetup();
  const notice = await publish(sessions.l1, world.offerings.A);
  const noticeB = await publish(sessions.l1, world.offerings.B);
  assert.equal(notice.status, 201);
  assert.equal(noticeB.status, 201);
  const { result } = world.conditions.s1A;
  result.isEca = false;
  result.resultCode = 'A';
  await result.save();
  await syncIncompleteCaFromResult(result);
  assert.equal((await linkOf(app1, world.conditions.s1A)).examStatus, 'RESOLVED');
  assert.equal((await linkOf(app1, world.conditions.s1B)).examStatus, 'SCHEDULED');
  assert.equal(await statusOf(app1), 'SCHEDULED');
  const linkA = await linkOf(app1, world.conditions.s1A);
  assert.equal(await Notification.countDocuments({ 'guardRef.linkId': String(linkA._id), status: { $in: ['SCHEDULED', 'PENDING'] } }), 0);
  const linkB = await linkOf(app1, world.conditions.s1B);
  assert.equal(await Notification.countDocuments({ 'guardRef.linkId': String(linkB._id), type: 'CA_REMINDER', status: 'SCHEDULED' }), 9);
});

test('reminders fire at the 7, 3 and 1 day marks exactly once and never after cancellation', async () => {
  const { world, sessions } = await fullSetup();
  const published = await publish(sessions.l1, world.offerings.A);
  const exam = new Date(published.body.data.scheduledAt);
  assert.equal(exam.getTime(), colomboLocalToUtc(colomboDate(10), '09:00').getTime());
  const infra = app.get('infrastructure');
  await settleExamMessages();
  const reminders = () => Notification.find({ type: 'CA_REMINDER', 'guardRef.noticeId': published.body.data.id });

  const early = await releaseDueNotifications({ now: new Date(exam.getTime() - 7 * DAY - 60_000), infrastructure: infra });
  assert.equal(early.released, 0, 'nothing before the 7 day mark');

  const jobsBefore = enqueued.length;
  const atSeven = new Date(exam.getTime() - 7 * DAY);
  const sevenDay = await releaseDueNotifications({ now: atSeven, infrastructure: infra });
  assert.equal(sevenDay.released, 6, 'in-app, email and WhatsApp for the applicant and the current-batch student');
  assert.equal(enqueued.length - jobsBefore, 4, 'only email and WhatsApp need a delivery job');
  const afterSeven = await reminders();
  assert.equal(afterSeven.filter((item) => item.reminderOffsetDays === 7 && item.status !== 'SCHEDULED').length, 6);
  assert.equal(afterSeven.filter((item) => item.reminderOffsetDays === 3 && item.status === 'SCHEDULED').length, 6);
  assert.equal(afterSeven.find((item) => item.reminderOffsetDays === 7 && item.channel === 'IN_APP').status, 'SENT');

  const twice = await releaseDueNotifications({ now: atSeven, infrastructure: infra });
  assert.equal(twice.released, 0, 'running the sweep again does not release or enqueue twice');
  assert.equal(enqueued.length - jobsBefore, 4);

  const threeDay = await releaseDueNotifications({ now: new Date(exam.getTime() - 3 * DAY), infrastructure: infra });
  assert.equal(threeDay.released, 6);

  // Cancel before the 1 day mark: that reminder must never be released.
  await post(sessions.l1, `/api/ca/lecturer/exam-notices/${published.body.data.id}/cancel`, { reason: 'Postponed' });
  const oneDay = await releaseDueNotifications({ now: new Date(exam.getTime() - DAY), infrastructure: infra });
  assert.equal(oneDay.released, 0);
  const final = await reminders();
  assert.equal(final.filter((item) => item.reminderOffsetDays === 1 && item.status === 'CANCELLED').length, 6);
});

test('a released reminder whose notice went stale is cancelled by the pre-send guard, not sent', async () => {
  const { world, sessions } = await fullSetup();
  const published = await publish(sessions.l1, world.offerings.A);
  const exam = new Date(published.body.data.scheduledAt);
  // Simulate a stale queue entry: the notice is cancelled without the reminders being cancelled.
  await CaExamNotice.updateOne({ _id: published.body.data.id }, { $set: { status: 'CANCELLED' } });
  const sent = [];
  const infra = {
    ...app.get('infrastructure'),
    email: { send: async (message) => (sent.push(message), { accepted: true, provider: 'smtp', providerMessageId: 'x' }) },
    whatsapp: { send: async (message) => (sent.push(message), { accepted: true, provider: 'meta', providerMessageId: 'y' }) },
    config,
  };
  const released = await releaseDueNotifications({ now: new Date(exam.getTime() - 7 * DAY), infrastructure: infra });
  assert.equal(released.cancelled, 6);
  assert.equal(released.released, 0);
  assert.equal(sent.length, 0);
});

test('delivery: email and WhatsApp template are sent once, failures are recorded honestly', async () => {
  const { world, sessions } = await fullSetup();
  await publish(sessions.l1, world.offerings.A);
  const email = await Notification.findOne({ type: 'CA_EXAM_SCHEDULED', channel: 'EMAIL' });
  const whatsapp = await Notification.findOne({ type: 'CA_EXAM_SCHEDULED', channel: 'WHATSAPP' });
  const calls = [];
  const configured = {
    ...config,
    whatsapp: { ...config.whatsapp, templates: { ...config.whatsapp.templates, CA_EXAM_SCHEDULED: 'ca_exam_scheduled' }, templateLanguage: 'en' },
  };
  const infra = {
    email: { send: async (message) => (calls.push(['email', message]), { accepted: true, provider: 'smtp', providerMessageId: 'mail-1' }) },
    whatsapp: { send: async (message) => (calls.push(['whatsapp', message]), { accepted: true, provider: 'meta', providerMessageId: 'wamid.1' }) },
    queue: { enqueue: async () => ({}) },
    config: configured,
  };
  assert.equal((await processNotificationDeliver({ notificationId: email._id, infrastructure: infra })).status, 'SENT');
  assert.equal((await processNotificationDeliver({ notificationId: whatsapp._id, infrastructure: infra })).status, 'SENT');
  assert.equal((await processNotificationDeliver({ notificationId: whatsapp._id, infrastructure: infra })).skipped, true);
  assert.equal(calls.length, 2);
  const waCall = calls.find(([kind]) => kind === 'whatsapp')[1];
  assert.equal(waCall.template.name, 'ca_exam_scheduled');
  assert.equal(waCall.template.parameters[0], 'ICT1001');
  assert.equal(waCall.template.parameters.length, 5);
  assert.equal((await Notification.findById(email._id)).providerMessageId, 'mail-1');

  // No approved template: failed with a clear category, nothing sent, never reported as sent.
  const other = await Notification.findOne({ type: 'CA_REMINDER', channel: 'WHATSAPP' });
  await Notification.updateOne({ _id: other._id }, { $set: { status: 'PENDING', scheduledAt: new Date(Date.now() - 1000) } });
  const unconfigured = await processNotificationDeliver({ notificationId: other._id, infrastructure: { ...infra, config } });
  assert.equal(unconfigured.status, 'FAILED');
  assert.equal((await Notification.findById(other._id)).failureCode, 'whatsapp_template_not_configured');
  assert.equal(calls.length, 2, 'no plain-text fallback for business-initiated CA messages');

  // The noop email provider accepts nothing.
  const reminderEmail = await Notification.findOne({ type: 'CA_REMINDER', channel: 'EMAIL' });
  await Notification.updateOne({ _id: reminderEmail._id }, { $set: { status: 'PENDING', scheduledAt: new Date(Date.now() - 1000) } });
  const noop = await processNotificationDeliver({
    notificationId: reminderEmail._id,
    infrastructure: { ...infra, email: { send: async () => ({ accepted: false, provider: 'noop', retryable: false, category: 'not_configured' }) } },
  });
  assert.equal(noop.status, 'FAILED');
  assert.equal((await Notification.findById(reminderEmail._id)).status, 'FAILED');

  // Recipient without an address is a permanent, non-retried failure.
  await User.updateOne({ _id: world.users.s1._id }, { $unset: { whatsappNumber: '' } });
  const reminderWa = await Notification.findOne({ type: 'CA_REMINDER', channel: 'WHATSAPP', reminderOffsetDays: 3 });
  await Notification.updateOne({ _id: reminderWa._id }, { $set: { status: 'PENDING', scheduledAt: new Date(Date.now() - 1000) } });
  const missing = await processNotificationDeliver({
    notificationId: reminderWa._id,
    infrastructure: { ...infra, config: { ...configured, whatsapp: { ...configured.whatsapp, templates: { CA_REMINDER: 'ca_reminder' } } } },
  });
  assert.equal(missing.status, 'FAILED');
  assert.equal((await Notification.findById(reminderWa._id)).failureCode, 'no_recipient_address');
});

test('simultaneous workers never send or release the same notification twice', async () => {
  const { world, sessions } = await fullSetup();
  await publish(sessions.l1, world.offerings.A);
  const email = await Notification.findOne({ type: 'CA_EXAM_SCHEDULED', channel: 'EMAIL' });
  await Notification.updateMany(
    { type: 'CA_EXAM_SCHEDULED', channel: 'WHATSAPP' },
    { $set: { status: 'SENT' } },
  );
  let sends = 0;
  const infra = {
    email: {
      send: async () => {
        sends += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { accepted: true, provider: 'smtp', providerMessageId: 'm' };
      },
    },
    whatsapp: { send: async () => ({ accepted: true }) },
    queue: { enqueue: async () => ({}) },
    config,
  };
  const results = await Promise.all(
    ['worker-a', 'worker-b', 'worker-c'].map((workerId) =>
      processNotificationDeliver({ notificationId: email._id, infrastructure: infra, workerId }),
    ),
  );
  assert.equal(sends, 1, 'exactly one provider call');
  assert.equal(results.filter((item) => !item.skipped).length, 1);
  assert.equal((await Notification.findById(email._id)).status, 'SENT');

  // Concurrent sweeps release each due reminder, and enqueue each delivery, exactly once.
  const published = await Notification.findOne({ type: 'CA_REMINDER', reminderOffsetDays: 7, channel: 'EMAIL' });
  const due = new Date(published.scheduledAt.getTime() + 1000);
  const before = enqueued.length;
  const sweeps = await Promise.all([1, 2, 3].map(() => releaseDueNotifications({ now: due, infrastructure: app.get('infrastructure') })));
  assert.equal(sweeps.reduce((sum, item) => sum + item.released, 0), 6);
  assert.equal(enqueued.length - before, 4);
});

test('expired leases are recovered and retries wait for their backoff', async () => {
  const { world, sessions } = await fullSetup();
  await publish(sessions.l1, world.offerings.A);
  const email = await Notification.findOne({ type: 'CA_EXAM_SCHEDULED', channel: 'EMAIL' });
  const now = new Date();
  const infra = app.get('infrastructure');

  await Notification.updateOne(
    { _id: email._id },
    { $set: { status: 'SENDING', leaseOwner: 'dead-worker', leaseExpiresAt: new Date(now.getTime() - 1000), attemptCount: 1 } },
  );
  const jobs = enqueued.length;
  const recovered = await releaseDueNotifications({ now, infrastructure: infra });
  assert.equal(recovered.recovered, 1);
  assert.equal(enqueued.length - jobs, 1);
  const revived = await Notification.findById(email._id);
  assert.equal(revived.status, 'PENDING');
  assert.equal(revived.leaseOwner, undefined);

  // A retryable provider failure schedules a backoff, and the sweep re-queues only after it elapses.
  const failing = {
    email: { send: async () => ({ accepted: false, provider: 'smtp', retryable: true, category: 'timeout' }) },
    whatsapp: { send: async () => ({ accepted: true }) },
    queue: { enqueue: async () => ({}) },
    config,
  };
  const outcome = await processNotificationDeliver({ notificationId: email._id, infrastructure: failing });
  assert.equal(outcome.status, 'RETRYING');
  const waiting = await Notification.findById(email._id);
  assert.ok(waiting.nextAttemptAt > now);
  assert.equal((await processNotificationDeliver({ notificationId: email._id, infrastructure: failing, now })).skipped, true);
  const tooSoon = await releaseDueNotifications({ now, infrastructure: infra });
  assert.equal(tooSoon.retried, 0);
  const later = await releaseDueNotifications({ now: new Date(waiting.nextAttemptAt.getTime() + 1000), infrastructure: infra });
  assert.equal(later.retried, 1);
});

test('inbox shows only released notifications and hides scheduled and cancelled ones', async () => {
  const { world, sessions } = await fullSetup();
  const published = await publish(sessions.l1, world.offerings.A);
  const inbox = await sessions.s1.agent.get('/api/notifications?pageSize=50');
  assert.equal(inbox.status, 200);
  const types = inbox.body.data.items.map((item) => item.type);
  assert.ok(types.includes('CA_EXAM_SCHEDULED'));
  assert.equal(types.includes('CA_REMINDER'), false, 'future reminders are not in the inbox yet');
  const count = await sessions.s1.agent.get('/api/notifications/unread-count');
  const visibleUnread = inbox.body.data.items.filter((item) => !item.readAt).length;
  assert.equal(count.body.data.count, visibleUnread);

  await post(sessions.l1, `/api/ca/lecturer/exam-notices/${published.body.data.id}/cancel`, { reason: 'Postponed' });
  const after = await sessions.s1.agent.get('/api/notifications?pageSize=50');
  assert.equal(after.body.data.items.some((item) => item.type === 'CA_REMINDER'), false);
  assert.ok(after.body.data.items.some((item) => item.type === 'CA_EXAM_CANCELLED'));
});

test('WhatsApp delivery receipts move SENT notifications forward only', async () => {
  const { world, sessions } = await fullSetup();
  await publish(sessions.l1, world.offerings.A);
  const sent = await Notification.findOne({ type: 'CA_EXAM_SCHEDULED', channel: 'WHATSAPP' });
  await Notification.updateOne({ _id: sent._id }, { $set: { status: 'SENT', providerMessageId: 'wamid.ok' } });
  const payload = (status, extra = {}) => ({
    entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.ok', status, timestamp: '1790000000', ...extra }] } }] }],
  });
  assert.deepEqual(await applyWhatsAppStatuses(payload('delivered')), { delivered: 1, failed: 0, ignored: 0 });
  assert.equal((await Notification.findById(sent._id)).status, 'DELIVERED');
  // A later failed receipt cannot move a delivered message backwards, and unknown ids are ignored.
  assert.equal((await applyWhatsAppStatuses(payload('failed', { errors: [{ code: 131026 }] }))).failed, 0);
  assert.equal((await Notification.findById(sent._id)).status, 'DELIVERED');
  assert.equal((await applyWhatsAppStatuses({ entry: [{ changes: [{ value: { statuses: [{ id: 'nope', status: 'delivered' }] } }] }] })).ignored, 1);

  await Notification.updateOne({ _id: sent._id }, { $set: { status: 'SENT' } });
  const failed = await applyWhatsAppStatuses(payload('failed', { errors: [{ code: 131026 }] }));
  assert.equal(failed.failed, 1);
  const stored = await Notification.findById(sent._id);
  assert.equal(stored.status, 'FAILED');
  assert.equal(stored.failureCode, '131026');
  assert.equal((await applyWhatsAppStatuses({})).ignored, 0);
});

test('subject exam states are back-filled for existing approved applications, idempotently', async () => {
  const world = await setup();
  const { s1 } = world.users;
  const application = await CaApplication.create({
    applicationId: 'CA-22ICT001-Y1S1',
    departmentId: world.department._id,
    studentUserId: s1._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    academicYearId: world.year._id,
    semesterId: world.semester._id,
    windowOpensAt: new Date(),
    windowClosesAt: new Date(),
    workflowStatus: 'SCHEDULED',
  });
  const link = (item, key) =>
    CaApplicationSubject.collection.insertOne({
      applicationId: application._id,
      incompleteCaId: item.condition._id,
      subjectId: world.subjects[key]._id,
      subjectOfferingId: world.offerings[key]._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  await link(world.conditions.s1A, 'A');
  await link(world.conditions.s1B, 'B');
  // A legacy schedule row has no status or generation.
  await CaSchedule.collection.insertOne({
    departmentId: world.department._id,
    applicationId: application._id,
    incompleteCaId: world.conditions.s1A.condition._id,
    subjectOfferingId: world.offerings.A._id,
    lecturerUserId: world.users.l1._id,
    calendarEventId: application._id,
    scheduledAt: new Date(Date.now() + 5 * DAY),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const first = await backfillSubjectExamStates(world.department._id);
  assert.equal(first.SCHEDULED, 1);
  assert.equal(first.READY_TO_SCHEDULE, 1);
  const statuses = (await CaApplicationSubject.find({ applicationId: application._id })).map((item) => item.examStatus).sort();
  assert.deepEqual(statuses, ['READY_TO_SCHEDULE', 'SCHEDULED']);
  const legacyRow = await CaSchedule.findOne({ applicationId: application._id });
  assert.equal(legacyRow.status, 'ACTIVE');
  const second = await backfillSubjectExamStates(world.department._id);
  assert.deepEqual(second, { READY_TO_SCHEDULE: 0, SCHEDULED: 0, COMPLETED: 0, RESOLVED: 0 });
  assert.equal(await IncompleteCa.countDocuments(), 4);
});

test('attendance and confirmation: attended subjects await results and leave the apply list, absent ones reopen', async () => {
  const { world, sessions } = await fullSetup();
  const { conditions, users } = world;
  const put = (session, url, body) => session.agent.put(url).set('X-CSRF-Token', session.csrfToken).send(body);
  const noticeB = await publish(sessions.l1, world.offerings.B);
  assert.equal(noticeB.status, 201, JSON.stringify(noticeB.body));
  const noticeId = noticeB.body.data.id;
  const s1Link = await linkOf(await CaApplication.findOne({ studentUserId: users.s1._id }).then((a) => a.applicationId), conditions.s1B);
  const s2Link = await linkOf(await CaApplication.findOne({ studentUserId: users.s2._id }).then((a) => a.applicationId), conditions.s2B);
  const attendanceUrl = `/api/ca/lecturer/exam-notices/${noticeId}/attendance`;
  const confirmUrl = `/api/ca/lecturer/exam-notices/${noticeId}/confirm-completion`;

  // Nothing can be recorded before the examination starts.
  assert.equal(
    (await put(sessions.l1, attendanceUrl, { attendance: [{ linkId: String(s1Link._id), attended: true }] })).status,
    400,
  );
  await CaExamNotice.updateOne({ _id: noticeId }, { $set: { scheduledAt: new Date(Date.now() - 3600_000) } });

  // Only the managing lecturer, and only students on this notice.
  assert.equal((await put(sessions.l2, attendanceUrl, { attendance: [{ linkId: String(s1Link._id), attended: true }] })).status, 403);
  assert.equal((await put(sessions.l1, attendanceUrl, { attendance: [{ linkId: String(world.conditions.s1A.condition._id), attended: true }] })).status, 400);

  // Confirmation needs a decision for every student.
  assert.equal((await put(sessions.l1, attendanceUrl, { attendance: [{ linkId: String(s1Link._id), attended: true }] })).status, 200);
  assert.equal((await post(sessions.l1, confirmUrl)).status, 400);
  assert.equal((await put(sessions.l1, attendanceUrl, { attendance: [{ linkId: String(s2Link._id), attended: false }] })).status, 200);

  const confirmed = await post(sessions.l1, confirmUrl);
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.deepEqual(confirmed.body.data, { completed: 1, missed: 1 });
  assert.equal((await CaApplicationSubject.findById(s1Link._id)).examStatus, 'COMPLETED');
  assert.equal((await CaApplicationSubject.findById(s2Link._id)).examStatus, 'MISSED');
  assert.equal((await CaExamNotice.findById(noticeId)).status, 'COMPLETED');
  assert.equal((await IncompleteCa.findById(conditions.s2B.condition._id)).status, 'OPEN', 'missed CA reopens the E(CA)');
  assert.equal((await IncompleteCa.findById(conditions.s1B.condition._id)).status, 'IN_APPLICATION', 'attended CA waits for the result');
  assert.equal(await Notification.countDocuments({ recipientUserId: users.s1._id, type: 'CA_EXAM_COMPLETED' }), 3);
  assert.equal(await Notification.countDocuments({ recipientUserId: users.s2._id, type: 'CA_EXAM_MISSED' }), 3);
  assert.equal((await post(sessions.l1, confirmUrl)).status, 400, 'a confirmed notice cannot be confirmed again');

  // The attended subject is no longer offered for application; the absent student can apply again.
  const s1Options = await sessions.s1.agent.get('/api/ca/conditions');
  assert.equal(s1Options.status, 200);
  const s1Ids = s1Options.body.data.items.map((item) => item.id);
  assert.ok(!s1Ids.includes(String(conditions.s1B.condition._id)), 'attended subject is hidden');
  assert.ok(s1Ids.includes(String(conditions.s1A.condition._id)), 'other subjects stay');
  const s1Preview = await sessions.s1.agent.get(`/api/ca/applications/preview?incompleteCaIds=${conditions.s1B.condition._id}`);
  assert.equal(s1Preview.status, 400, 'an attended subject cannot be applied for again');
  const s2Options = await sessions.s2.agent.get('/api/ca/conditions');
  assert.ok(s2Options.body.data.items.map((item) => item.id).includes(String(conditions.s2B.condition._id)));
});
