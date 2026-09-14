import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { User } from '../../src/modules/authentication/models/user.model.js';
import { hashPassword } from '../../src/modules/authentication/security/passwords.js';
import { LecturerAssignment } from '../../src/modules/academic-foundation/models/lecturer-assignment.model.js';
import { StudentAcademicHistory } from '../../src/modules/academic-foundation/models/student-academic-history.model.js';
import { AuditEvent } from '../../src/modules/audit-security/index.js';
import { ROLES } from '../../src/shared/constants/roles.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-04';
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
    app = createApp({
      config,
      logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
      infrastructure: { email: { send: async () => ({ accepted: false, provider: 'noop' }) } },
    });
  } catch (error) {
    process.stderr.write(`Skipping academic integration tests: ${error.message}\n`);
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

async function createUser({ role, email, password = 'correcthorse', accountStatus = 'ACTIVE', departmentId, lecturerStatus }) {
  return User.create({
    role,
    email,
    displayName: email,
    accountStatus,
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
  const nextCsrf = response.body.data.csrfToken;
  return { agent, csrfToken: nextCsrf };
}

async function bootstrapDepartment(adminEmail = 'admin@example.test') {
  await createUser({ role: ROLES.DEPARTMENT_ADMINISTRATOR, email: adminEmail });
  const session = await login(adminEmail);
  const created = await session.agent
    .post('/api/academic/departments')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: 'ICT', name: 'Department of ICT' });
  assert.equal(created.status, 201);
  return { ...session, department: created.body.data };
}

dbTest('students and lecturers cannot use academic admin endpoints', async () => {
  const { department } = await bootstrapDepartment();
  await createUser({
    role: ROLES.STUDENT,
    email: 'student@example.test',
    departmentId: department.id,
  });
  await createUser({
    role: ROLES.LECTURER,
    email: 'lecturer@example.test',
    departmentId: department.id,
    lecturerStatus: 'VERIFIED',
  });
  const student = await login('student@example.test');
  const lecturer = await login('lecturer@example.test');
  const studentRes = await student.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', student.csrfToken)
    .send({ code: '22', name: '22 batch' });
  const lecturerRes = await lecturer.agent
    .post('/api/academic/lecturer-assignments')
    .set('X-CSRF-Token', lecturer.csrfToken)
    .send({ lecturerUserId: 'x', subjectOfferingId: 'y' });
  assert.equal(studentRes.status, 403);
  assert.equal(lecturerRes.status, 403);
});

dbTest('admin can create structure, offerings reject duplicates, and subject codes stay immutable', async () => {
  const session = await bootstrapDepartment();
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22', name: '22 batch' });
  const year = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 1, name: 'Year 1' });
  const semester = await session.agent
    .post('/api/academic/semesters')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ academicYearId: year.body.data.id, sequence: 1, name: 'Semester 1' });
  const subject = await session.agent
    .post('/api/academic/subjects')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: 'ict1233', name: 'Synthetic Subject', credits: 3 });
  assert.equal(subject.body.data.code, 'ICT1233');
  const offering = await session.agent
    .post('/api/academic/subject-offerings')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      subjectId: subject.body.data.id,
      batchId: batch.body.data.id,
      academicYearId: year.body.data.id,
      semesterId: semester.body.data.id,
    });
  assert.equal(offering.status, 201);
  const duplicate = await session.agent
    .post('/api/academic/subject-offerings')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      subjectId: subject.body.data.id,
      batchId: batch.body.data.id,
      academicYearId: year.body.data.id,
      semesterId: semester.body.data.id,
    });
  assert.equal(duplicate.status, 409);
  const renameCode = await session.agent
    .patch(`/api/academic/subjects/${subject.body.data.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: 'OTHER' });
  assert.equal(renameCode.status, 400);
  const audit = await AuditEvent.find({ action: 'academic.offering.create' });
  assert.equal(audit.length, 1);
});

dbTest('unverified lecturers cannot be assigned; revoke keeps the assignment row', async () => {
  const session = await bootstrapDepartment();
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22', name: '22 batch' });
  const year = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 1, name: 'Year 1' });
  const semester = await session.agent
    .post('/api/academic/semesters')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ academicYearId: year.body.data.id, sequence: 1, name: 'Semester 1' });
  const subject = await session.agent
    .post('/api/academic/subjects')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: 'ICT1233', name: 'Synthetic Subject', credits: 3 });
  const offering = await session.agent
    .post('/api/academic/subject-offerings')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      subjectId: subject.body.data.id,
      batchId: batch.body.data.id,
      academicYearId: year.body.data.id,
      semesterId: semester.body.data.id,
    });
  const lecturer = await createUser({
    role: ROLES.LECTURER,
    email: 'lecturer@example.test',
    departmentId: session.department.id,
    lecturerStatus: 'UNVERIFIED',
  });
  const denied = await session.agent
    .post('/api/academic/lecturer-assignments')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ lecturerUserId: String(lecturer._id), subjectOfferingId: offering.body.data.id });
  assert.equal(denied.status, 400);
  await session.agent
    .patch(`/api/academic/lecturers/${lecturer._id}/status`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ lecturerStatus: 'VERIFIED' });
  const assigned = await session.agent
    .post('/api/academic/lecturer-assignments')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ lecturerUserId: String(lecturer._id), subjectOfferingId: offering.body.data.id });
  assert.equal(assigned.status, 201);
  const revoked = await session.agent
    .patch(`/api/academic/lecturer-assignments/${assigned.body.data.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({});
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.data.isActive, false);
  const reassigned = await session.agent
    .post('/api/academic/lecturer-assignments')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ lecturerUserId: String(lecturer._id), subjectOfferingId: offering.body.data.id });
  assert.equal(reassigned.status, 201);
  assert.equal(reassigned.body.data.id, assigned.body.data.id);
  assert.equal(reassigned.body.data.isActive, true);
  assert.equal(await LecturerAssignment.countDocuments({ lecturerUserId: lecturer._id }), 1);
});

dbTest('student current semester updates write history and do not change registration number', async () => {
  const session = await bootstrapDepartment();
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22', name: '22 batch' });
  const year1 = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 1, name: 'Year 1' });
  const year2 = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 2, name: 'Year 2' });
  const sem1 = await session.agent
    .post('/api/academic/semesters')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ academicYearId: year1.body.data.id, sequence: 1, name: 'Y1S1' });
  const sem2 = await session.agent
    .post('/api/academic/semesters')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ academicYearId: year2.body.data.id, sequence: 1, name: 'Y2S1' });
  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'student@example.test',
    departmentId: session.department.id,
  });
  const created = await session.agent
    .post('/api/academic/students')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      userId: String(student._id),
      registrationNumber: 'SEU/IS/22/ICT/024',
      batchId: batch.body.data.id,
      currentAcademicYearId: year1.body.data.id,
      currentSemesterId: sem1.body.data.id,
    });
  assert.equal(created.status, 201);
  const moved = await session.agent
    .patch(`/api/academic/students/${created.body.data.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      currentAcademicYearId: year2.body.data.id,
      currentSemesterId: sem2.body.data.id,
      registrationNumber: 'CHANGED',
    });
  assert.equal(moved.status, 400);
  const progressed = await session.agent
    .patch(`/api/academic/students/${created.body.data.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      currentAcademicYearId: year2.body.data.id,
      currentSemesterId: sem2.body.data.id,
    });
  assert.equal(progressed.status, 200);
  assert.equal(progressed.body.data.registrationNumber, 'SEU/IS/22/ICT/024');
  const history = await StudentAcademicHistory.find({ userId: student._id });
  assert.ok(history.length >= 2);
});

dbTest('object-level academic access is assignment and department scoped', async () => {
  const sessionA = await bootstrapDepartment('admin-a@example.test');
  const batchRes = await sessionA.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', sessionA.csrfToken)
    .send({ code: '22', name: '22 batch' });
  assert.equal(batchRes.status, 201);
  const batchA = batchRes.body.data.id;
  await createUser({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'admin-b@example.test',
  });
  const sessionB = await login('admin-b@example.test');
  await sessionB.agent
    .post('/api/academic/departments')
    .set('X-CSRF-Token', sessionB.csrfToken)
    .send({ code: 'ENG', name: 'English' });
  const cross = await sessionB.agent
    .patch(`/api/academic/batches/${batchA}`)
    .set('X-CSRF-Token', sessionB.csrfToken)
    .send({ name: 'hijack' });
  assert.equal(cross.status, 404);

  const lecturer = await createUser({
    role: ROLES.LECTURER,
    email: 'lecturer-a@example.test',
    departmentId: sessionA.department.id,
    lecturerStatus: 'VERIFIED',
  });
  const year = await sessionA.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', sessionA.csrfToken)
    .send({ sequence: 1, name: 'Year 1' });
  const semester = await sessionA.agent
    .post('/api/academic/semesters')
    .set('X-CSRF-Token', sessionA.csrfToken)
    .send({ academicYearId: year.body.data.id, sequence: 1, name: 'Semester 1' });
  const subject = await sessionA.agent
    .post('/api/academic/subjects')
    .set('X-CSRF-Token', sessionA.csrfToken)
    .send({ code: 'ICT1233', name: 'Synthetic Subject', credits: 3 });
  const offering = await sessionA.agent
    .post('/api/academic/subject-offerings')
    .set('X-CSRF-Token', sessionA.csrfToken)
    .send({
      subjectId: subject.body.data.id,
      batchId: batchA,
      academicYearId: year.body.data.id,
      semesterId: semester.body.data.id,
    });
  const lecturerSession = await login('lecturer-a@example.test');
  const unassigned = await lecturerSession.agent.get(`/api/academic/subject-offerings/${offering.body.data.id}`);
  assert.equal(unassigned.status, 403);
  await sessionA.agent
    .post('/api/academic/lecturer-assignments')
    .set('X-CSRF-Token', sessionA.csrfToken)
    .send({ lecturerUserId: String(lecturer._id), subjectOfferingId: offering.body.data.id });
  const assigned = await lecturerSession.agent.get(`/api/academic/subject-offerings/${offering.body.data.id}`);
  assert.equal(assigned.status, 200);
});

dbTest('unauthenticated academic routes remain denied', async () => {
  const response = await request(app).get('/api/academic/batches');
  assert.equal(response.status, 401);
});
