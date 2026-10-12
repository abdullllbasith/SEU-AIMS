import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { User } from '../../src/modules/authentication/models/user.model.js';
import { hashPassword } from '../../src/modules/authentication/security/passwords.js';
import { Batch } from '../../src/modules/academic-foundation/models/batch.model.js';
import { SubjectOffering } from '../../src/modules/academic-foundation/models/subject-offering.model.js';
import { StudentAcademicContext } from '../../src/modules/academic-foundation/models/student-academic-context.model.js';
import { StudentAcademicHistory } from '../../src/modules/academic-foundation/models/student-academic-history.model.js';
import { SubjectEnrollment } from '../../src/modules/academic-foundation/models/subject-enrollment.model.js';
import { LecturerAssignment } from '../../src/modules/academic-foundation/models/lecturer-assignment.model.js';
import { AcademicResult } from '../../src/modules/results/models/academic-result.model.js';
import { GpaSnapshot } from '../../src/modules/gpa-cgpa/index.js';
import { AuditEvent } from '../../src/modules/audit-security/index.js';
import { ROLES } from '../../src/shared/constants/roles.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-04b';
process.env.NODE_ENV = 'test';

let mongoReady = false;
let app;
let config;

before(async () => {
  try {
    await startIsolatedMongo();
    mongoReady = true;
    config = loadConfig();
    config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
    config.auth.loginMaxAttempts = 100;
    config.api.rateLimitMax = 10000;
    app = createApp({
      config,
      logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
      infrastructure: { email: { send: async () => ({ accepted: false, provider: 'noop' }) } },
    });
    await SubjectEnrollment.init();
  } catch (error) {
    process.stderr.write(`Skipping enrollment integration tests: ${error.message}\n`);
  }
});

after(async () => {
  if (mongoReady) {
    await stopIsolatedMongo();
  }
});

beforeEach(async () => {
  if (mongoReady) {
    await clearIsolatedMongo();
  }
});

function dbTest(name, fn) {
  test(name, async (t) => {
    if (!mongoReady) {
      t.skip('Isolated MongoDB is not available in this environment');
      return;
    }
    await fn(t);
  });
}

async function createUser({ role, email, password = 'correcthorse', departmentId, lecturerStatus }) {
  return User.create({
    role,
    email,
    displayName: email,
    accountStatus: 'ACTIVE',
    departmentId,
    passwordHash: await hashPassword(password, { minLength: 10 }),
    lecturerStatus: lecturerStatus ?? (role === ROLES.LECTURER ? 'UNVERIFIED' : 'NOT_APPLICABLE'),
  });
}

async function login(email, password = 'correcthorse') {
  const agent = request.agent(app);
  const csrf = await agent.get('/api/auth/csrf');
  const csrfToken = csrf.body.data.csrfToken;
  const response = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrfToken)
    .send({ identifier: email, password });
  assert.equal(response.status, 200);
  return { agent, csrfToken: response.body.data.csrfToken };
}

async function bootstrapDepartment(adminEmail = 'admin@example.test', code = 'ICT', name = 'Department of ICT') {
  await createUser({ role: ROLES.DEPARTMENT_ADMINISTRATOR, email: adminEmail });
  const session = await login(adminEmail);
  const created = await session.agent
    .post('/api/academic/departments')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code, name });
  assert.equal(created.status, 201);
  return { ...session, department: created.body.data };
}

async function createPeriod(session) {
  const year = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 1, name: 'Year 1' });
  assert.equal(year.status, 201);
  const semester = await session.agent
    .post('/api/academic/semesters')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ academicYearId: year.body.data.id, sequence: 1, name: 'Semester 1' });
  assert.equal(semester.status, 201);
  return { year: year.body.data, semester: semester.body.data };
}

async function seedOffering({ adminEmail = 'admin@example.test', code = 'ICT', registrationNumber = 'SEU/IS/22/ICT/001' } = {}) {
  const session = await bootstrapDepartment(adminEmail, code, `${code} department`);
  const period = await createPeriod(session);
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22ICT', name: '22 ICT' });
  assert.equal(batch.status, 201);
  const subject = await session.agent
    .post('/api/academic/subjects')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: 'ICT1233', name: 'Synthetic Subject', credits: 3 });
  assert.equal(subject.status, 201);
  const offering = await session.agent
    .post('/api/academic/subject-offerings')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      subjectId: subject.body.data.id,
      batchId: batch.body.data.id,
      academicYearId: period.year.id,
      semesterId: period.semester.id,
    });
  assert.equal(offering.status, 201);
  const student = await createUser({
    role: ROLES.STUDENT,
    email: `${code.toLowerCase()}-student@example.test`,
    departmentId: session.department.id,
  });
  const context = await session.agent
    .post('/api/academic/students')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      userId: String(student._id),
      registrationNumber,
      batchId: batch.body.data.id,
      currentAcademicYearId: period.year.id,
      currentSemesterId: period.semester.id,
    });
  assert.equal(context.status, 201);
  return {
    session,
    period,
    batch: batch.body.data,
    subject: subject.body.data,
    offering: offering.body.data,
    student,
    context: context.body.data,
  };
}

function enroll(session, offeringId, body) {
  return session.agent
    .post(`/api/academic/subject-offerings/${offeringId}/enrollments`)
    .set('X-CSRF-Token', session.csrfToken)
    .send(body);
}

dbTest('department admin can enroll a student as REPEAT or ARREAR', async () => {
  const world = await seedOffering();
  const repeat = await enroll(world.session, world.offering.id, {
    studentContextId: world.context.id,
    enrollmentType: 'REPEAT',
  });
  assert.equal(repeat.status, 201);
  assert.equal(repeat.body.data.enrollmentType, 'REPEAT');
  assert.equal(repeat.body.data.status, 'ACTIVE');
  assert.equal(repeat.body.data.registrationNumber, 'SEU/IS/22/ICT/001');
  assert.equal(repeat.body.data.subjectCode, 'ICT1233');
  assert.equal(repeat.body.data.batchId, world.batch.id);
  assert.equal(repeat.body.data.departmentId, world.session.department.id);
  assert.equal(repeat.body.data.academicResultId, null);

  const other = await createUser({
    role: ROLES.STUDENT,
    email: 'arrear-student@example.test',
    departmentId: world.session.department.id,
  });
  const arrearContext = await world.session.agent
    .post('/api/academic/students')
    .set('X-CSRF-Token', world.session.csrfToken)
    .send({
      userId: String(other._id),
      registrationNumber: 'SEU/IS/22/ICT/002',
      batchId: world.batch.id,
      currentAcademicYearId: world.period.year.id,
      currentSemesterId: world.period.semester.id,
    });
  const result = await AcademicResult.create({
    departmentId: world.session.department.id,
    studentUserId: other._id,
    registrationNumber: 'SEU/IS/22/ICT/002',
    subjectId: world.subject.id,
    subjectCode: 'ICT1233',
    studentAcademicYearId: world.period.year.id,
    studentSemesterId: world.period.semester.id,
    resultCode: 'E',
    version: 1,
  });
  const arrear = await enroll(world.session, world.offering.id, {
    studentContextId: arrearContext.body.data.id,
    enrollmentType: 'ARREAR',
    academicResultId: String(result._id),
  });
  assert.equal(arrear.status, 201);
  assert.equal(arrear.body.data.enrollmentType, 'ARREAR');
  assert.equal(arrear.body.data.academicResultId, String(result._id));
  assert.equal(arrear.body.data.originalAcademicYearId, world.period.year.id);
  assert.equal(arrear.body.data.originalSemesterId, world.period.semester.id);
  assert.equal(result.resultCode, 'E');

  const offeringList = await world.session.agent.get(
    `/api/academic/subject-offerings/${world.offering.id}/enrollments`,
  );
  assert.equal(offeringList.status, 200);
  assert.equal(offeringList.body.data.total, 2);
  const studentList = await world.session.agent.get(
    `/api/academic/students/${world.context.id}/enrollments`,
  );
  assert.equal(studentList.body.data.total, 1);
  assert.equal(studentList.body.data.items[0].enrollmentType, 'REPEAT');
  const audits = await AuditEvent.find({ action: 'academic.enrollment.create' });
  assert.equal(audits.length, 2);
});

dbTest('duplicate and concurrent active enrollments return 409 and keep a single active row', async () => {
  const world = await seedOffering();
  const body = { studentContextId: world.context.id, enrollmentType: 'REPEAT' };
  const first = await enroll(world.session, world.offering.id, body);
  assert.equal(first.status, 201);
  const duplicate = await enroll(world.session, world.offering.id, body);
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.body.error.message, /already enrolled/i);

  const raced = await Promise.all([
    enroll(world.session, world.offering.id, { studentContextId: world.context.id, enrollmentType: 'ARREAR' }),
    enroll(world.session, world.offering.id, { studentContextId: world.context.id, enrollmentType: 'ARREAR' }),
  ]);
  assert.deepEqual(raced.map((item) => item.status).sort(), [409, 409]);
  assert.equal(
    await SubjectEnrollment.countDocuments({
      studentUserId: world.student._id,
      subjectOfferingId: world.offering.id,
      status: 'ACTIVE',
    }),
    1,
  );
});

dbTest('a concurrent first enrollment allows one create and rejects the other', async () => {
  const world = await seedOffering();
  const body = { studentContextId: world.context.id, enrollmentType: 'REPEAT' };
  const raced = await Promise.all([
    enroll(world.session, world.offering.id, body),
    enroll(world.session, world.offering.id, body),
  ]);
  assert.deepEqual(raced.map((item) => item.status).sort(), [201, 409]);
  assert.equal(await SubjectEnrollment.countDocuments({ status: 'ACTIVE' }), 1);
});

dbTest('invalid relationships, cross-department access, and missing auth are rejected', async () => {
  const world = await seedOffering();
  const otherBatch = await world.session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', world.session.csrfToken)
    .send({ code: '23ICT', name: '23 ICT' });
  const otherStudent = await createUser({
    role: ROLES.STUDENT,
    email: 'other-batch@example.test',
    departmentId: world.session.department.id,
  });
  const otherContext = await world.session.agent
    .post('/api/academic/students')
    .set('X-CSRF-Token', world.session.csrfToken)
    .send({
      userId: String(otherStudent._id),
      registrationNumber: 'SEU/IS/23/ICT/001',
      batchId: otherBatch.body.data.id,
      currentAcademicYearId: world.period.year.id,
      currentSemesterId: world.period.semester.id,
    });
  const wrongBatch = await enroll(world.session, world.offering.id, {
    studentContextId: otherContext.body.data.id,
    enrollmentType: 'REPEAT',
  });
  assert.equal(wrongBatch.status, 400);

  const otherSubject = await world.session.agent
    .post('/api/academic/subjects')
    .set('X-CSRF-Token', world.session.csrfToken)
    .send({ code: 'ICT9999', name: 'Other', credits: 2 });
  const mismatchedResult = await AcademicResult.create({
    departmentId: world.session.department.id,
    studentUserId: world.student._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    subjectId: otherSubject.body.data.id,
    subjectCode: 'ICT9999',
    studentAcademicYearId: world.period.year.id,
    studentSemesterId: world.period.semester.id,
    resultCode: 'E',
  });
  const wrongSubject = await enroll(world.session, world.offering.id, {
    studentContextId: world.context.id,
    enrollmentType: 'ARREAR',
    academicResultId: String(mismatchedResult._id),
  });
  assert.equal(wrongSubject.status, 400);

  const spoofed = await enroll(world.session, world.offering.id, {
    studentContextId: world.context.id,
    enrollmentType: 'REPEAT',
    batchId: otherBatch.body.data.id,
    departmentId: '507f1f77bcf86cd799439011',
  });
  assert.equal(spoofed.status, 400);

  const missingStudent = await enroll(world.session, world.offering.id, {
    studentContextId: '507f1f77bcf86cd799439011',
    enrollmentType: 'REPEAT',
  });
  assert.equal(missingStudent.status, 404);
  const missingOffering = await enroll(world.session, '507f1f77bcf86cd799439011', {
    studentContextId: world.context.id,
    enrollmentType: 'REPEAT',
  });
  assert.equal(missingOffering.status, 404);
  const badType = await enroll(world.session, world.offering.id, {
    studentContextId: world.context.id,
    enrollmentType: 'MAKEUP',
  });
  assert.equal(badType.status, 400);

  const otherAdmin = await bootstrapDepartment('other-admin@example.test', 'ENG', 'English');
  const cross = await enroll(otherAdmin, world.offering.id, {
    studentContextId: world.context.id,
    enrollmentType: 'REPEAT',
  });
  assert.equal(cross.status, 404);
  const crossList = await otherAdmin.agent.get(
    `/api/academic/subject-offerings/${world.offering.id}/enrollments`,
  );
  assert.equal(crossList.status, 404);

  await createUser({
    role: ROLES.STUDENT,
    email: 'plain-student@example.test',
    departmentId: world.session.department.id,
  });
  await createUser({
    role: ROLES.LECTURER,
    email: 'lecturer@example.test',
    departmentId: world.session.department.id,
    lecturerStatus: 'VERIFIED',
  });
  const studentSession = await login('plain-student@example.test');
  const lecturerSession = await login('lecturer@example.test');
  const studentDenied = await enroll(studentSession, world.offering.id, {
    studentContextId: world.context.id,
    enrollmentType: 'REPEAT',
  });
  const lecturerDenied = await lecturerSession.agent.get(
    `/api/academic/subject-offerings/${world.offering.id}/enrollments`,
  );
  assert.equal(studentDenied.status, 403);
  assert.equal(lecturerDenied.status, 403);
  assert.equal(
    (
      await request(app).post(`/api/academic/subject-offerings/${world.offering.id}/enrollments`).send({
        studentContextId: world.context.id,
        enrollmentType: 'REPEAT',
      })
    ).status,
    401,
  );
  const missingCsrf = await world.session.agent
    .post(`/api/academic/subject-offerings/${world.offering.id}/enrollments`)
    .send({ studentContextId: world.context.id, enrollmentType: 'REPEAT' });
  assert.equal(missingCsrf.status, 403);
});

dbTest('cancellation keeps history and a later enrollment creates a new active row', async () => {
  const world = await seedOffering();
  const created = await enroll(world.session, world.offering.id, {
    studentContextId: world.context.id,
    enrollmentType: 'REPEAT',
  });
  const cancelled = await world.session.agent
    .patch(`/api/academic/enrollments/${created.body.data.id}`)
    .set('X-CSRF-Token', world.session.csrfToken)
    .send({ status: 'CANCELLED' });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.data.status, 'CANCELLED');
  assert.ok(cancelled.body.data.cancelledAt);
  const stored = await SubjectEnrollment.findById(created.body.data.id);
  assert.equal(stored.status, 'CANCELLED');
  const again = await world.session.agent
    .patch(`/api/academic/enrollments/${created.body.data.id}`)
    .set('X-CSRF-Token', world.session.csrfToken)
    .send({ status: 'CANCELLED' });
  assert.equal(again.status, 409);
  const reactivate = await world.session.agent
    .patch(`/api/academic/enrollments/${created.body.data.id}`)
    .set('X-CSRF-Token', world.session.csrfToken)
    .send({ status: 'ACTIVE' });
  assert.equal(reactivate.status, 400);

  const next = await enroll(world.session, world.offering.id, {
    studentContextId: world.context.id,
    enrollmentType: 'ARREAR',
  });
  assert.equal(next.status, 201);
  assert.notEqual(next.body.data.id, created.body.data.id);
  const rows = await SubjectEnrollment.find({ studentUserId: world.student._id }).sort({ createdAt: 1 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'CANCELLED');
  assert.equal(rows[1].status, 'ACTIVE');
  assert.equal(rows[1].enrollmentType, 'ARREAR');
});

dbTest('enrollment does not change context, history, results, offerings, or GPA', async () => {
  const world = await seedOffering();
  const result = await AcademicResult.create({
    departmentId: world.session.department.id,
    studentUserId: world.student._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    subjectId: world.subject.id,
    subjectCode: 'ICT1233',
    studentAcademicYearId: world.period.year.id,
    studentSemesterId: world.period.semester.id,
    resultCode: 'C',
    version: 1,
  });
  const contextBefore = await StudentAcademicContext.findById(world.context.id).lean();
  const historyBefore = await StudentAcademicHistory.countDocuments({ userId: world.student._id });
  const batchBefore = await Batch.findById(world.batch.id).lean();
  const offeringBefore = await SubjectOffering.findById(world.offering.id).lean();
  const assignmentCount = await LecturerAssignment.countDocuments();
  const gpaBefore = await GpaSnapshot.countDocuments({ studentUserId: world.student._id });

  const created = await enroll(world.session, world.offering.id, {
    studentContextId: world.context.id,
    enrollmentType: 'REPEAT',
    academicResultId: String(result._id),
  });
  assert.equal(created.status, 201);

  const contextAfter = await StudentAcademicContext.findById(world.context.id).lean();
  const batchAfter = await Batch.findById(world.batch.id).lean();
  const offeringAfter = await SubjectOffering.findById(world.offering.id).lean();
  const resultAfter = await AcademicResult.findById(result._id).lean();
  assert.equal(String(contextAfter.batchId), String(contextBefore.batchId));
  assert.equal(String(contextAfter.currentAcademicYearId), String(contextBefore.currentAcademicYearId));
  assert.equal(String(contextAfter.currentSemesterId), String(contextBefore.currentSemesterId));
  assert.equal(contextAfter.registrationNumber, contextBefore.registrationNumber);
  assert.equal(contextAfter.status, contextBefore.status);
  assert.equal(await StudentAcademicHistory.countDocuments({ userId: world.student._id }), historyBefore);
  assert.equal(String(batchAfter.currentAcademicYearId), String(batchBefore.currentAcademicYearId));
  assert.equal(String(batchAfter.currentSemesterId), String(batchBefore.currentSemesterId));
  assert.equal(String(offeringAfter.subjectId), String(offeringBefore.subjectId));
  assert.equal(offeringAfter.status, offeringBefore.status);
  assert.equal(await LecturerAssignment.countDocuments(), assignmentCount);
  assert.equal(resultAfter.resultCode, 'C');
  assert.equal(resultAfter.version, 1);
  assert.equal(String(resultAfter.studentAcademicYearId), String(result.studentAcademicYearId));
  assert.equal(await AcademicResult.countDocuments({ registrationNumber: 'SEU/IS/22/ICT/001', subjectCode: 'ICT1233' }), 1);
  assert.equal(await GpaSnapshot.countDocuments({ studentUserId: world.student._id }), gpaBefore);
});
