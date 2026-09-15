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
import { CalendarEvent } from '../../src/modules/notices-calendar/models/calendar-event.model.js';
import { Notification } from '../../src/modules/notifications/models/notification.model.js';
import { syncIncompleteCaFromResult } from '../../src/modules/ca-recovery/services/eca-from-results.js';
import { evaluateReminder } from '../../src/modules/ca-recovery/services/reminder.service.js';
import { CaSchedule } from '../../src/modules/ca-recovery/models/ca-schedule.model.js';
import { ROLES } from '../../src/shared/constants/roles.js';
import { AuditEvent } from '../../src/modules/audit-security/index.js';
import { CA_ACTIVE_APPLICATION_STATUSES } from '../../src/modules/ca-recovery/constants.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-09';
process.env.NODE_ENV = 'test';

let app;
let config;

before(async () => {
  await startIsolatedMongo();
  config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  config.auth.loginMaxAttempts = 100;
  config.storage = {
    driver: 'local_dev',
    localPath: path.resolve(process.cwd(), '..', '.local-storage', `ca-files-${process.pid}`),
  };
  app = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
    infrastructure: {
      email: { send: async () => ({ accepted: false, provider: 'noop' }) },
      storage: createFileStorage({ config, backendRoot: process.cwd() }),
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
  const batch = await Batch.create({ departmentId: department._id, code: '22', name: '22 batch' });
  const year = await AcademicYear.create({ departmentId: department._id, sequence: 1, name: 'Year 1' });
  const semester = await Semester.create({
    departmentId: department._id,
    academicYearId: year._id,
    sequence: 1,
    name: 'Semester 1',
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
  const otherLecturer = await createUser({
    role: ROLES.LECTURER,
    email: 'other-lecturer@example.test',
    departmentId: department._id,
  });
  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'student@example.test',
    departmentId: department._id,
  });
  const other = await createUser({
    role: ROLES.STUDENT,
    email: 'other@example.test',
    departmentId: department._id,
  });
  await LecturerAssignment.create({
    departmentId: department._id,
    lecturerUserId: lecturer._id,
    subjectOfferingId: offering._id,
    assignedByUserId: admin._id,
  });
  await StudentAcademicContext.create({
    userId: student._id,
    departmentId: department._id,
    batchId: batch._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
  });
  await StudentAcademicContext.create({
    userId: other._id,
    departmentId: department._id,
    batchId: batch._id,
    registrationNumber: 'SEU/IS/22/ICT/002',
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
  });
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
    committedByUserId: admin._id,
  });
  const condition = await syncIncompleteCaFromResult(result);
  const otherResult = await AcademicResult.create({
    departmentId: department._id,
    studentUserId: other._id,
    registrationNumber: 'SEU/IS/22/ICT/002',
    subjectId: subject._id,
    subjectCode: 'ICT1233',
    studentAcademicYearId: year._id,
    studentSemesterId: semester._id,
    resultCode: 'E(CA)',
    isEca: true,
    committedByUserId: admin._id,
  });
  await syncIncompleteCaFromResult(otherResult);
  return { department, year, semester, offering, admin, lecturer, otherLecturer, student, other, result, condition };
}

async function openWindow(admin, { year, semester, opensAt, closesAt, published = true }) {
  return admin.agent
    .post('/api/ca/admin/windows')
    .set('X-CSRF-Token', admin.csrfToken)
    .send({
      academicYearId: String(year._id),
      semesterId: String(semester._id),
      opensAt,
      closesAt,
      published,
    });
}

test('E(CA) creates an incomplete condition and duplicate sync is idempotent', async () => {
  const { result, condition, student } = await seed();
  assert.equal(condition.status, 'OPEN');
  assert.equal(condition.subjectCode, 'ICT1233');
  const again = await syncIncompleteCaFromResult(result);
  assert.equal(String(again._id), String(condition._id));
  assert.equal(await IncompleteCa.countDocuments({ studentUserId: student._id }), 1);
});

test('closed window blocks submission; open window allows eligible subjects only', async () => {
  const { year, semester, condition } = await seed();
  const admin = await login('admin@example.test');
  const student = await login('student@example.test');
  const closed = await openWindow(admin, {
    year,
    semester,
    opensAt: new Date(Date.now() - 48 * 3600_000).toISOString(),
    closesAt: new Date(Date.now() - 1000).toISOString(),
  });
  assert.equal(closed.status, 201);
  const blocked = await student.agent
    .post('/api/ca/applications')
    .set('X-CSRF-Token', student.csrfToken)
    .send({
      academicYearId: String(year._id),
      semesterId: String(semester._id),
      incompleteCaIds: [String(condition._id)],
    });
  assert.equal(blocked.status, 400);

  await openWindow(admin, {
    year,
    semester,
    opensAt: new Date(Date.now() - 3600_000).toISOString(),
    closesAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
  });
  const other = await login('other@example.test');
  const otherCond = await IncompleteCa.findOne({ registrationNumber: 'SEU/IS/22/ICT/002' });
  const injected = await student.agent
    .post('/api/ca/applications')
    .set('X-CSRF-Token', student.csrfToken)
    .send({
      academicYearId: String(year._id),
      semesterId: String(semester._id),
      incompleteCaIds: [String(otherCond._id)],
      studentUserId: String(other.agent),
      workflowStatus: 'APPROVED',
    });
  assert.equal(injected.status, 403);

  const created = await student.agent
    .post('/api/ca/applications')
    .set('X-CSRF-Token', student.csrfToken)
    .send({
      academicYearId: String(year._id),
      semesterId: String(semester._id),
      incompleteCaIds: [String(condition._id)],
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.workflowStatus, 'DRAFT');
  const duplicate = await student.agent
    .post('/api/ca/applications')
    .set('X-CSRF-Token', student.csrfToken)
    .send({
      academicYearId: String(year._id),
      semesterId: String(semester._id),
      incompleteCaIds: [String(condition._id)],
    });
  assert.equal(duplicate.status, 409);
});

test('submit generates PDF and QR without exposing grades; IDOR is denied', async () => {
  const { year, semester, condition } = await seed();
  const admin = await login('admin@example.test');
  const student = await login('student@example.test');
  await openWindow(admin, {
    year,
    semester,
    opensAt: new Date(Date.now() - 3600_000).toISOString(),
    closesAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
  });
  const created = await student.agent
    .post('/api/ca/applications')
    .set('X-CSRF-Token', student.csrfToken)
    .send({
      academicYearId: String(year._id),
      semesterId: String(semester._id),
      incompleteCaIds: [String(condition._id)],
    });
  const submitted = await student.agent
    .post(`/api/ca/applications/${created.body.data.applicationId}/submit`)
    .set('X-CSRF-Token', student.csrfToken)
    .send({});
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.data.workflowStatus, 'SUBMITTED');
  assert.equal(submitted.body.data.pdfStatus, 'READY');
  assert.match(submitted.body.data.applicationId, /^CA-[a-f0-9]{32}$/);
  const stored = await CaApplication.findOne({ applicationId: submitted.body.data.applicationId });
  const verify = await request(app).get(`/api/ca/verify/${stored.qrVerificationToken}`);
  assert.equal(verify.status, 200);
  assert.equal(verify.body.data.authentic, true);
  assert.equal(verify.body.data.applicationId, stored.applicationId);
  assert.equal(verify.body.data.registrationNumber, undefined);
  assert.equal(verify.body.data.resultCode, undefined);
  const tamper = await request(app).get('/api/ca/verify/not-a-real-token');
  assert.equal(tamper.status, 404);

  const other = await login('other@example.test');
  const idor = await other.agent.get(`/api/ca/applications/${stored.applicationId}`);
  assert.equal(idor.status, 404);
  const pdfIdor = await other.agent.get(`/api/ca/applications/${stored.applicationId}/pdf`);
  assert.equal(pdfIdor.status, 404);
  const unknownPdf = await other.agent.get(`/api/ca/applications/CA-${'0'.repeat(32)}/pdf`);
  assert.equal(unknownPdf.status, 404);
  const ownerPdf = await student.agent.get(`/api/ca/applications/${stored.applicationId}/pdf`);
  assert.equal(ownerPdf.status, 200);
  assert.match(ownerPdf.headers['content-type'], /pdf/);
  const adminPdf = await admin.agent.get(`/api/ca/applications/${stored.applicationId}/pdf`);
  assert.equal(adminPdf.status, 200);
  const adminQueue = await admin.agent.get('/api/ca/admin/applications');
  assert.equal(adminQueue.status, 200);
  const studentAdmin = await student.agent.get('/api/ca/admin/applications');
  assert.equal(studentAdmin.status, 403);
});

test('physical verify, approve, lecturer scope, schedule, reminders, and cancel', async () => {
  const { year, semester, condition, offering } = await seed();
  const admin = await login('admin@example.test');
  const student = await login('student@example.test');
  const lecturer = await login('lecturer@example.test');
  const otherLecturer = await login('other-lecturer@example.test');
  await openWindow(admin, {
    year,
    semester,
    opensAt: new Date(Date.now() - 3600_000).toISOString(),
    closesAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
  });
  const created = await student.agent
    .post('/api/ca/applications')
    .set('X-CSRF-Token', student.csrfToken)
    .send({
      academicYearId: String(year._id),
      semesterId: String(semester._id),
      incompleteCaIds: [String(condition._id)],
    });
  const applicationId = created.body.data.applicationId;
  await student.agent.post(`/api/ca/applications/${applicationId}/submit`).set('X-CSRF-Token', student.csrfToken).send({});
  const earlyApprove = await admin.agent
    .post(`/api/ca/admin/applications/${applicationId}/approve`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(earlyApprove.status, 400);
  await admin.agent
    .post(`/api/ca/admin/applications/${applicationId}/verify`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ outcome: 'verified' });
  const approved = await admin.agent
    .post(`/api/ca/admin/applications/${applicationId}/approve`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.workflowStatus, 'APPROVED');

  const visible = await lecturer.agent.get('/api/ca/lecturer/eligible-students');
  assert.equal(visible.status, 200);
  assert.equal(visible.body.data.items.length, 1);
  const hidden = await otherLecturer.agent.get('/api/ca/lecturer/eligible-students');
  assert.equal(hidden.body.data.items.length, 0);

  const forbiddenSchedule = await otherLecturer.agent
    .post('/api/ca/lecturer/schedules')
    .set('X-CSRF-Token', otherLecturer.csrfToken)
    .send({
      applicationId,
      incompleteCaId: String(condition._id),
      subjectOfferingId: String(offering._id),
      scheduledAt: new Date(Date.now() + 8 * 24 * 3600_000).toISOString(),
    });
  assert.equal(forbiddenSchedule.status, 403);

  const scheduled = await lecturer.agent
    .post('/api/ca/lecturer/schedules')
    .set('X-CSRF-Token', lecturer.csrfToken)
    .send({
      applicationId,
      incompleteCaId: String(condition._id),
      subjectOfferingId: String(offering._id),
      scheduledAt: new Date(Date.now() + 8 * 24 * 3600_000).toISOString(),
      venue: 'Lab 1',
    });
  assert.equal(scheduled.status, 201);
  assert.equal(await CalendarEvent.countDocuments({ eventType: 'CA_SCHEDULE' }), 1);
  const reminders = await Notification.countDocuments({ type: 'CA_REMINDER' });
  assert.equal(reminders, 9);

  const schedule = await CaSchedule.findById(scheduled.body.data.id);
  const tooEarly = await evaluateReminder({ scheduleId: schedule._id, offsetDays: 7, now: new Date() });
  assert.equal(tooEarly.sent, false);
  const due = await evaluateReminder({
    scheduleId: schedule._id,
    offsetDays: 7,
    now: new Date(schedule.scheduledAt.getTime() - 6 * 24 * 3600_000),
  });
  assert.equal(due.sent, true);
  const duplicateReminder = await evaluateReminder({
    scheduleId: schedule._id,
    offsetDays: 7,
    now: new Date(schedule.scheduledAt.getTime() - 6 * 24 * 3600_000),
  });
  assert.equal(duplicateReminder.reason, 'ALREADY_SENT');

  await lecturer.agent
    .post(`/api/ca/lecturer/schedules/${schedule._id}/cancel`)
    .set('X-CSRF-Token', lecturer.csrfToken)
    .send({});
  const calendar = await CalendarEvent.findById(schedule.calendarEventId);
  assert.ok(calendar.cancelledAt);
  assert.equal(calendar.reminderEnabled, false);
  assert.equal(await CalendarEvent.countDocuments(CalendarEvent.activeFilter({ eventType: 'CA_SCHEDULE' })), 0);
  assert.equal(await CalendarEvent.countDocuments({ eventType: 'CA_SCHEDULE' }), 1);
  assert.equal(await AuditEvent.countDocuments({ action: 'ca.schedule.cancel', entityId: String(schedule._id) }), 1);
  const cancelled = await evaluateReminder({
    scheduleId: schedule._id,
    offsetDays: 1,
    now: new Date(schedule.scheduledAt.getTime()),
  });
  assert.equal(cancelled.reason, 'CANCELLED_OR_MISSING');
});

test('reject and reopen restore draft editability; later official result resolves the condition', async () => {
  const { year, semester, condition, result } = await seed();
  const admin = await login('admin@example.test');
  const student = await login('student@example.test');
  await openWindow(admin, {
    year,
    semester,
    opensAt: new Date(Date.now() - 3600_000).toISOString(),
    closesAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
  });
  const created = await student.agent
    .post('/api/ca/applications')
    .set('X-CSRF-Token', student.csrfToken)
    .send({
      academicYearId: String(year._id),
      semesterId: String(semester._id),
      incompleteCaIds: [String(condition._id)],
    });
  const applicationId = created.body.data.applicationId;
  await student.agent.post(`/api/ca/applications/${applicationId}/submit`).set('X-CSRF-Token', student.csrfToken).send({});
  await admin.agent
    .post(`/api/ca/admin/applications/${applicationId}/reject`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ reason: 'Signature missing' });
  const reopened = await admin.agent
    .post(`/api/ca/admin/applications/${applicationId}/reopen`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ reason: 'Student may resubmit' });
  assert.equal(reopened.body.data.workflowStatus, 'DRAFT');
  assert.equal(await CaApplication.countDocuments(), 1);

  result.isEca = false;
  result.resultCode = 'A';
  await result.save();
  await syncIncompleteCaFromResult(result);
  const resolved = await IncompleteCa.findById(condition._id);
  assert.equal(resolved.status, 'RESOLVED');
});

test('concurrent semester applications leave one record; completing CA does not write a grade', async () => {
  const { year, semester, condition, result, offering } = await seed();
  const admin = await login('admin@example.test');
  const student = await login('student@example.test');
  const lecturer = await login('lecturer@example.test');
  await openWindow(admin, {
    year,
    semester,
    opensAt: new Date(Date.now() - 3600_000).toISOString(),
    closesAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
  });
  const payload = {
    academicYearId: String(year._id),
    semesterId: String(semester._id),
    incompleteCaIds: [String(condition._id)],
  };
  const [first, second] = await Promise.all([
    student.agent.post('/api/ca/applications').set('X-CSRF-Token', student.csrfToken).send(payload),
    student.agent.post('/api/ca/applications').set('X-CSRF-Token', student.csrfToken).send(payload),
  ]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [201, 409]);
  assert.equal(await CaApplication.countDocuments({ studentUserId: (await CaApplication.findOne()).studentUserId }), 1);

  const applicationId = first.status === 201 ? first.body.data.applicationId : second.body.data.applicationId;
  await student.agent.post(`/api/ca/applications/${applicationId}/submit`).set('X-CSRF-Token', student.csrfToken).send({});
  await admin.agent
    .post(`/api/ca/admin/applications/${applicationId}/verify`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ outcome: 'verified' });
  await admin.agent.post(`/api/ca/admin/applications/${applicationId}/approve`).set('X-CSRF-Token', admin.csrfToken).send({});
  await lecturer.agent
    .post('/api/ca/lecturer/schedules')
    .set('X-CSRF-Token', lecturer.csrfToken)
    .send({
      applicationId,
      incompleteCaId: String(condition._id),
      subjectOfferingId: String(offering._id),
      scheduledAt: new Date(Date.now() + 8 * 24 * 3600_000).toISOString(),
    });
  const completed = await lecturer.agent
    .post(`/api/ca/lecturer/applications/${applicationId}/complete`)
    .set('X-CSRF-Token', lecturer.csrfToken)
    .send({});
  assert.equal(completed.status, 200);
  assert.equal(completed.body.data.workflowStatus, 'COMPLETED');
  const official = await AcademicResult.findById(result._id);
  assert.equal(official.resultCode, 'E(CA)');
  assert.equal(official.isEca, true);
});

test('completed or resolved cycle does not block a later E(CA) application; duplicate active is still rejected', async () => {
  const { year, semester, condition, result } = await seed();
  const admin = await login('admin@example.test');
  const student = await login('student@example.test');
  const lecturer = await login('lecturer@example.test');
  await openWindow(admin, {
    year,
    semester,
    opensAt: new Date(Date.now() - 3600_000).toISOString(),
    closesAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
  });

  const firstDraft = await student.agent
    .post('/api/ca/applications')
    .set('X-CSRF-Token', student.csrfToken)
    .send({
      academicYearId: String(year._id),
      semesterId: String(semester._id),
      incompleteCaIds: [String(condition._id)],
    });
  assert.equal(firstDraft.status, 201);
  const firstApplicationId = firstDraft.body.data.applicationId;
  await student.agent
    .post(`/api/ca/applications/${firstApplicationId}/submit`)
    .set('X-CSRF-Token', student.csrfToken)
    .send({});
  await admin.agent
    .post(`/api/ca/admin/applications/${firstApplicationId}/verify`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ outcome: 'verified' });
  await admin.agent
    .post(`/api/ca/admin/applications/${firstApplicationId}/approve`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  const completed = await lecturer.agent
    .post(`/api/ca/lecturer/applications/${firstApplicationId}/complete`)
    .set('X-CSRF-Token', lecturer.csrfToken)
    .send({});
  assert.equal(completed.status, 200);
  assert.equal(completed.body.data.workflowStatus, 'COMPLETED');

  result.isEca = false;
  result.resultCode = 'A';
  await result.save();
  await syncIncompleteCaFromResult(result);
  assert.equal((await IncompleteCa.findById(condition._id)).status, 'RESOLVED');
  assert.equal((await CaApplication.findOne({ applicationId: firstApplicationId })).workflowStatus, 'RESOLVED');

  result.isEca = true;
  result.resultCode = 'E(CA)';
  await result.save();
  const reopenedCondition = await syncIncompleteCaFromResult(result);
  assert.equal(String(reopenedCondition._id), String(condition._id));
  assert.equal(reopenedCondition.status, 'OPEN');

  const payload = {
    academicYearId: String(year._id),
    semesterId: String(semester._id),
    incompleteCaIds: [String(condition._id)],
  };
  const reentry = await student.agent.post('/api/ca/applications').set('X-CSRF-Token', student.csrfToken).send(payload);
  assert.equal(reentry.status, 201);
  assert.notEqual(reentry.body.data.applicationId, firstApplicationId);
  assert.equal(reentry.body.data.workflowStatus, 'DRAFT');
  assert.equal(await CaApplication.countDocuments({ studentUserId: result.studentUserId }), 2);
  assert.equal(
    await CaApplication.countDocuments({
      studentUserId: result.studentUserId,
      workflowStatus: { $in: [...CA_ACTIVE_APPLICATION_STATUSES] },
    }),
    1,
  );

  const duplicateActive = await student.agent
    .post('/api/ca/applications')
    .set('X-CSRF-Token', student.csrfToken)
    .send(payload);
  assert.equal(duplicateActive.status, 409);
  assert.equal(await CaApplication.countDocuments({ studentUserId: result.studentUserId }), 2);
});
