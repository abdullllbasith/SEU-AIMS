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
import { Notification } from '../../src/modules/notifications/models/notification.model.js';
import { CalendarEvent } from '../../src/modules/notices-calendar/models/calendar-event.model.js';
import { Notice } from '../../src/modules/notices-calendar/models/notice.model.js';
import { processNotificationDeliver } from '../../src/modules/notifications/services/delivery.service.js';
import { evaluateCalendarReminder } from '../../src/modules/notices-calendar/services/calendar.service.js';
import { fanoutNotification } from '../../src/modules/notifications/services/fanout.service.js';
import { ROLES } from '../../src/shared/constants/roles.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-10';
process.env.NODE_ENV = 'test';

let app;
let config;
let capturedEmail;

before(async () => {
  await startIsolatedMongo();
  config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  config.auth.loginMaxAttempts = 100;
  capturedEmail = [];
  app = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
    infrastructure: {
      email: {
        send: async (message) => {
          capturedEmail.push(message);
          return { accepted: false, provider: 'noop', retryable: false, category: 'not_configured' };
        },
      },
      whatsapp: {
        send: async () => ({ accepted: false, provider: 'noop', retryable: false, category: 'not_configured' }),
      },
      storage: { putObject: async () => ({}), getObject: async () => ({ body: Buffer.from('') }) },
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
  capturedEmail = [];
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
  const semester = await Semester.create({
    departmentId: department._id,
    academicYearId: year._id,
    sequence: 1,
    name: 'Semester 1',
  });
  const subject = await Subject.create({ departmentId: department._id, code: 'ICT1233', name: 'Programming', credits: 3 });
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
  const otherAdmin = await createUser({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'other-admin@example.test',
    departmentId: otherDept._id,
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
  const otherStudent = await createUser({
    role: ROLES.STUDENT,
    email: 'other@example.test',
    departmentId: department._id,
  });
  const foreignLecturer = await createUser({
    role: ROLES.LECTURER,
    email: 'mgt-lecturer@example.test',
    departmentId: otherDept._id,
  });
  const foreignStudent = await createUser({
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
  await StudentAcademicContext.create({
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
  return {
    department,
    otherDept,
    offering,
    subject,
    batch,
    year,
    semester,
    admin,
    otherAdmin,
    lecturer,
    otherLecturer,
    foreignLecturer,
    student,
    otherStudent,
    foreignStudent,
  };
}

test('draft notices are hidden from students; publish fans out asynchronously and is idempotent', async () => {
  const { offering } = await seed();
  const admin = await login('admin@example.test');
  const student = await login('student@example.test');
  const created = await admin.agent
    .post('/api/notices/admin')
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ title: 'Exam timetable', body: 'Week 12', targeting: { kind: 'ALL_STUDENTS' } });
  assert.equal(created.status, 201);
  const draftList = await student.agent.get('/api/notices');
  assert.equal(draftList.body.data.items.length, 0);
  const draftGet = await student.agent.get(`/api/notices/${created.body.data.id}`);
  assert.equal(draftGet.status, 404);
  const studentPublish = await student.agent
    .post(`/api/notices/admin/${created.body.data.id}/publish`)
    .set('X-CSRF-Token', student.csrfToken)
    .send({});
  assert.equal(studentPublish.status, 403);
  const published = await admin.agent
    .post(`/api/notices/admin/${created.body.data.id}/publish`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(published.status, 200);
  const visible = await student.agent.get('/api/notices');
  assert.equal(visible.body.data.items.length, 1);
  const inbox = await student.agent.get('/api/notifications');
  assert.ok(inbox.body.data.items.some((item) => item.type === 'NOTICE_PUBLISHED'));
  const again = await admin.agent
    .post(`/api/notices/admin/${created.body.data.id}/publish`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(again.status, 200);
  assert.equal(await Notification.countDocuments({ type: 'NOTICE_PUBLISHED', channel: 'IN_APP' }), 2);
  assert.ok(offering);
});

test('GET /api/notices/:id is 404 across departments for student, lecturer, and admin', async () => {
  const { otherDept, otherAdmin, foreignLecturer, foreignStudent } = await seed();
  const admin = await login('admin@example.test');
  const created = await admin.agent
    .post('/api/notices/admin')
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ title: 'ICT only', body: 'Do not leak', targeting: { kind: 'ALL_STUDENTS' } });
  assert.equal(created.status, 201);
  const published = await admin.agent
    .post(`/api/notices/admin/${created.body.data.id}/publish`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(published.status, 200);
  const noticeId = created.body.data.id;

  const foreignStudentSession = await login('mgt-student@example.test');
  const foreignLecturerSession = await login('mgt-lecturer@example.test');
  const otherAdminSession = await login('other-admin@example.test');
  const studentGet = await foreignStudentSession.agent.get(`/api/notices/${noticeId}`);
  const lecturerGet = await foreignLecturerSession.agent.get(`/api/notices/${noticeId}`);
  const adminGet = await otherAdminSession.agent.get(`/api/notices/${noticeId}`);
  assert.equal(studentGet.status, 404);
  assert.equal(lecturerGet.status, 404);
  assert.equal(adminGet.status, 404);

  const draft = await Notice.create({
    departmentId: otherDept._id,
    publisherUserId: otherAdmin._id,
    title: 'MGT draft',
    body: 'Secret draft',
    publicationState: 'DRAFT',
    targeting: { kind: 'ALL_STUDENTS' },
  });
  const homeAdmin = await login('admin@example.test');
  const draftGet = await homeAdmin.agent.get(`/api/notices/${draft._id}`);
  assert.equal(draftGet.status, 404);
  assert.ok(foreignLecturer);
  assert.ok(foreignStudent);
});

test('notice targeting ALL_STUDENTS, BATCH, ROLE, and SUBJECT is enforced', async () => {
  const { offering, subject, batch, year, semester, admin: adminUser, student: studentUser } = await seed();
  const otherBatch = await Batch.create({
    departmentId: offering.departmentId,
    code: '21',
    name: '21 batch',
  });
  const outsider = await createUser({
    role: ROLES.STUDENT,
    email: 'batch-outsider@example.test',
    departmentId: offering.departmentId,
  });
  await StudentAcademicContext.create({
    userId: outsider._id,
    departmentId: offering.departmentId,
    batchId: otherBatch._id,
    registrationNumber: 'SEU/IS/21/ICT/001',
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
  });

  const admin = await login('admin@example.test');
  const student = await login('student@example.test');
  const outsiderSession = await login('batch-outsider@example.test');
  const lecturer = await login('lecturer@example.test');

  const allStudents = await admin.agent
    .post('/api/notices/admin')
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ title: 'All ICT students', body: 'Broadcast', targeting: { kind: 'ALL_STUDENTS' } });
  await admin.agent
    .post(`/api/notices/admin/${allStudents.body.data.id}/publish`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal((await student.agent.get(`/api/notices/${allStudents.body.data.id}`)).status, 200);
  assert.equal((await lecturer.agent.get(`/api/notices/${allStudents.body.data.id}`)).status, 404);

  const batchNotice = await admin.agent
    .post('/api/notices/admin')
    .set('X-CSRF-Token', admin.csrfToken)
    .send({
      title: 'Batch 22 only',
      body: 'For 22',
      targeting: { kind: 'BATCH', batchId: String(batch._id) },
    });
  await admin.agent
    .post(`/api/notices/admin/${batchNotice.body.data.id}/publish`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal((await student.agent.get(`/api/notices/${batchNotice.body.data.id}`)).status, 200);
  assert.equal((await outsiderSession.agent.get(`/api/notices/${batchNotice.body.data.id}`)).status, 404);

  const roleNotice = await admin.agent
    .post('/api/notices/admin')
    .set('X-CSRF-Token', admin.csrfToken)
    .send({
      title: 'Lecturers only',
      body: 'Staff note',
      targeting: { kind: 'ROLE', role: ROLES.LECTURER },
    });
  await admin.agent
    .post(`/api/notices/admin/${roleNotice.body.data.id}/publish`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal((await lecturer.agent.get(`/api/notices/${roleNotice.body.data.id}`)).status, 200);
  assert.equal((await student.agent.get(`/api/notices/${roleNotice.body.data.id}`)).status, 404);
  assert.equal((await admin.agent.get(`/api/notices/${roleNotice.body.data.id}`)).status, 200);

  const subjectNotice = await admin.agent
    .post('/api/notices/admin')
    .set('X-CSRF-Token', admin.csrfToken)
    .send({
      title: 'Programming only',
      body: 'Lab change',
      targeting: { kind: 'SUBJECT', subjectId: String(subject._id) },
    });
  await admin.agent
    .post(`/api/notices/admin/${subjectNotice.body.data.id}/publish`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal((await student.agent.get(`/api/notices/${subjectNotice.body.data.id}`)).status, 200);
  assert.equal((await outsiderSession.agent.get(`/api/notices/${subjectNotice.body.data.id}`)).status, 404);
  assert.ok(adminUser);
  assert.ok(studentUser);
});

test('notification read state is user-specific and IDOR is denied', async () => {
  await seed();
  const student = await login('student@example.test');
  const other = await login('other@example.test');
  await fanoutNotification({
    recipientUserId: (await User.findOne({ email: 'student@example.test' }))._id,
    type: 'RESULTS_UPDATED',
    sourceModule: 'results',
    sourceId: 'import-1',
    actionPath: '/results/me',
  });
  const mine = await student.agent.get('/api/notifications');
  const id = mine.body.data.items[0].id;
  const stolen = await other.agent
    .patch(`/api/notifications/${id}/read`)
    .set('X-CSRF-Token', other.csrfToken)
    .send({});
  assert.equal(stolen.status, 404);
  const unreadOther = await other.agent.get('/api/notifications/unread-count');
  assert.equal(unreadOther.body.data.count, 0);
  await student.agent.patch(`/api/notifications/${id}/read`).set('X-CSRF-Token', student.csrfToken).send({});
  const unread = await student.agent.get('/api/notifications/unread-count');
  assert.equal(unread.body.data.count, 0);
});

test('optional WhatsApp preference is honoured; mandatory notice still fans out', async () => {
  await seed();
  const studentUser = await User.findOne({ email: 'student@example.test' });
  const student = await login('student@example.test');
  await student.agent
    .patch('/api/notifications/preferences')
    .set('X-CSRF-Token', student.csrfToken)
    .send({ emailEnabled: false, whatsappEnabled: false });
  await fanoutNotification({
    recipientUserId: studentUser._id,
    type: 'CA_REMINDER',
    sourceModule: 'ca-recovery',
    sourceId: 'sched-1',
    reminderOffsetDays: 7,
  });
  assert.equal(await Notification.countDocuments({ type: 'CA_REMINDER', recipientUserId: studentUser._id }), 1);
  await fanoutNotification({
    recipientUserId: studentUser._id,
    type: 'NOTICE_PUBLISHED',
    sourceModule: 'notices-calendar',
    sourceId: 'notice-1',
    vars: { title: 'Mandatory' },
  });
  assert.equal(await Notification.countDocuments({ type: 'NOTICE_PUBLISHED', recipientUserId: studentUser._id }), 3);
});

test('email delivery is asynchronous, noop is not delivered, retries stay bounded', async () => {
  await seed();
  const studentUser = await User.findOne({ email: 'student@example.test' });
  await fanoutNotification({
    recipientUserId: studentUser._id,
    type: 'RESULTS_UPDATED',
    sourceModule: 'results',
    sourceId: 'import-2',
    infrastructure: { queue: { enqueue: async () => ({ id: 'x' }) }, email: { send: async () => ({ accepted: false, retryable: true, category: 'transient', provider: 'noop' }) }, whatsapp: { send: async () => ({ accepted: false, retryable: false, category: 'not_configured', provider: 'noop' }) } },
  });
  const emailDoc = await Notification.findOne({ recipientUserId: studentUser._id, channel: 'EMAIL' });
  const first = await processNotificationDeliver({
    notificationId: emailDoc._id,
    infrastructure: {
      email: { send: async () => ({ accepted: false, retryable: true, category: 'transient', provider: 'test' }) },
      queue: { enqueue: async () => ({ id: 'retry' }) },
    },
  });
  assert.equal(first.status, 'RETRYING');
  emailDoc.attemptCount = 5;
  await emailDoc.save();
  const exhausted = await processNotificationDeliver({
    notificationId: emailDoc._id,
    infrastructure: {
      email: { send: async () => ({ accepted: false, retryable: true, category: 'transient', provider: 'test' }) },
      queue: { enqueue: async () => ({ id: 'retry' }) },
    },
  });
  assert.equal(exhausted.status, 'FAILED');
  assert.notEqual(exhausted.status, 'DELIVERED');
});

test('admin and lecturer calendar scoping; CA calendar rows cannot be mutated here', async () => {
  const { offering } = await seed();
  const admin = await login('admin@example.test');
  const lecturer = await login('lecturer@example.test');
  const otherLecturer = await login('other-lecturer@example.test');
  const student = await login('student@example.test');
  const created = await admin.agent
    .post('/api/calendar/admin/events')
    .set('X-CSRF-Token', admin.csrfToken)
    .send({
      title: 'Department meeting',
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      eventType: 'DEPARTMENT',
    });
  assert.equal(created.status, 201);
  const forbidden = await otherLecturer.agent
    .post('/api/calendar/lecturer/events')
    .set('X-CSRF-Token', otherLecturer.csrfToken)
    .send({
      title: 'Hijack',
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      subjectOfferingId: String(offering._id),
    });
  assert.equal(forbidden.status, 403);
  const assignment = await lecturer.agent
    .post('/api/calendar/lecturer/events')
    .set('X-CSRF-Token', lecturer.csrfToken)
    .send({
      title: 'Lab deadline',
      startsAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      subjectOfferingId: String(offering._id),
      reminderEnabled: true,
      reminderOffsetsHours: [24],
    });
  assert.equal(assignment.status, 201);
  const studentEvents = await student.agent.get('/api/calendar/events');
  assert.ok(studentEvents.body.data.items.some((item) => item.title === 'Department meeting'));
  assert.ok(studentEvents.body.data.items.some((item) => item.title === 'Lab deadline'));
  const caEvent = await CalendarEvent.create({
    title: 'CA recovery secret',
    startsAt: new Date(Date.now() + 3 * 86400000),
    createdByUserId: (await User.findOne({ email: 'lecturer@example.test' }))._id,
    departmentId: offering.departmentId,
    eventType: 'CA_SCHEDULE',
    subjectOfferingId: offering._id,
    sourceModule: 'ca-recovery',
    publicationState: 'PUBLISHED',
  });
  const mutate = await admin.agent
    .patch(`/api/calendar/admin/events/${caEvent._id}`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ title: 'changed' });
  assert.equal(mutate.status, 403);
  const otherAdmin = await login('other-admin@example.test');
  const cross = await otherAdmin.agent.get(`/api/calendar/events/${created.body.data.id}`);
  assert.equal(cross.status, 404);
});

test('cancelled and rescheduled events do not fire stale reminders; duplicate reminder jobs are idempotent', async () => {
  const { offering } = await seed();
  const lecturerUser = await User.findOne({ email: 'lecturer@example.test' });
  const event = await CalendarEvent.create({
    title: 'Quiz',
    startsAt: new Date(Date.now() + 48 * 3600_000),
    createdByUserId: lecturerUser._id,
    departmentId: offering.departmentId,
    eventType: 'ASSIGNMENT_DEADLINE',
    publicationState: 'PUBLISHED',
    subjectOfferingId: offering._id,
    reminderEnabled: true,
    reminderOffsetsHours: [24],
    reminderGeneration: 1,
  });
  const tooEarly = await evaluateCalendarReminder({
    calendarEventId: event._id,
    offsetHours: 24,
    generation: 1,
    now: new Date(),
  });
  assert.equal(tooEarly.reason, 'TOO_EARLY');
  const stale = await evaluateCalendarReminder({
    calendarEventId: event._id,
    offsetHours: 24,
    generation: 0,
    now: new Date(event.startsAt.getTime() - 12 * 3600_000),
  });
  assert.equal(stale.reason, 'STALE');
  const due = await evaluateCalendarReminder({
    calendarEventId: event._id,
    offsetHours: 24,
    generation: 1,
    now: new Date(event.startsAt.getTime() - 12 * 3600_000),
  });
  assert.equal(due.sent, true);
  const duplicate = await evaluateCalendarReminder({
    calendarEventId: event._id,
    offsetHours: 24,
    generation: 1,
    now: new Date(event.startsAt.getTime() - 12 * 3600_000),
  });
  assert.equal(duplicate.created, 0);
  assert.equal(await Notification.countDocuments({ type: 'CALENDAR_REMINDER', channel: 'IN_APP' }), 3);
  event.cancelledAt = new Date();
  await event.save();
  const cancelled = await evaluateCalendarReminder({
    calendarEventId: event._id,
    offsetHours: 24,
    generation: 1,
    now: new Date(event.startsAt.getTime()),
  });
  assert.equal(cancelled.reason, 'INACTIVE');
  assert.equal(await CalendarEvent.countDocuments(CalendarEvent.activeFilter({ _id: event._id })), 0);
});
