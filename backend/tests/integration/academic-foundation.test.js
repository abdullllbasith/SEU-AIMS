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
import { AcademicYear } from '../../src/modules/academic-foundation/models/academic-year.model.js';
import { LecturerAssignment } from '../../src/modules/academic-foundation/models/lecturer-assignment.model.js';
import { SubjectOffering } from '../../src/modules/academic-foundation/models/subject-offering.model.js';
import { Semester } from '../../src/modules/academic-foundation/models/semester.model.js';
import { StudentAcademicContext } from '../../src/modules/academic-foundation/models/student-academic-context.model.js';
import { StudentAcademicHistory } from '../../src/modules/academic-foundation/models/student-academic-history.model.js';
import { CurriculumMapping } from '../../src/modules/academic-foundation/models/curriculum-mapping.model.js';
import { AcademicResult } from '../../src/modules/results/models/academic-result.model.js';
import { IncompleteCa } from '../../src/modules/ca-recovery/models/incomplete-ca.model.js';
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
    config.api.rateLimitMax = 10000;
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

async function createPeriod(session, yearSequence, yearName, semesterSequence, semesterName) {
  const year = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: yearSequence, name: yearName });
  assert.equal(year.status, 201);
  const semester = await session.agent
    .post('/api/academic/semesters')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      academicYearId: year.body.data.id,
      sequence: semesterSequence,
      name: semesterName,
    });
  assert.equal(semester.status, 201);
  return { year: year.body.data, semester: semester.body.data };
}

async function verifyBatchAt(session, batchId, yearId, semesterId) {
  const response = await session.agent
    .post(`/api/academic/batches/${batchId}/academic-context`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ currentAcademicYearId: yearId, currentSemesterId: semesterId });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
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
  const period = await createPeriod(session, 1, 'Year 1', 1, 'Semester 1');
  const year = { body: { data: period.year } };
  const semester = { body: { data: period.semester } };
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22', name: '22 batch' });
  assert.equal(batch.body.data.currentAcademicYearId, null);
  assert.equal(batch.body.data.currentSemesterId, null);
  assert.equal(batch.body.data.academicContextVerifiedAt, null);
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
  const period = await createPeriod(session, 1, 'Year 1', 1, 'Semester 1');
  const year = { body: { data: period.year } };
  const semester = { body: { data: period.semester } };
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22', name: '22 batch' });
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
  const first = await createPeriod(session, 1, 'Year 1', 1, 'Y1S1');
  const year1 = { body: { data: first.year } };
  const sem1 = { body: { data: first.semester } };
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22', name: '22 batch' });
  const second = await createPeriod(session, 2, 'Year 2', 1, 'Y2S1');
  const year2 = { body: { data: second.year } };
  const sem2 = { body: { data: second.semester } };
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
  const period = await createPeriod(sessionA, 1, 'Year 1', 1, 'Semester 1');
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
  const year = { body: { data: period.year } };
  const semester = { body: { data: period.semester } };
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

dbTest('academic reconciliation reports missing membership and stale assignment without changing records', async () => {
  const session = await bootstrapDepartment();
  await createUser({
    role: ROLES.STUDENT,
    email: 'student@example.test',
    departmentId: session.department.id,
  });
  const lecturer = await createUser({
    role: ROLES.LECTURER,
    email: 'lecturer@example.test',
    departmentId: session.department.id,
    lecturerStatus: 'VERIFIED',
  });
  const period = await createPeriod(session, 1, 'Year 1', 1, 'Semester 1');
  const year = { body: { data: period.year } };
  const semester = { body: { data: period.semester } };
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22', name: '22 batch' });
  const laterYear = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 2, name: 'Year 2' });
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
  const assignment = await session.agent
    .post('/api/academic/lecturer-assignments')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ lecturerUserId: String(lecturer._id), subjectOfferingId: offering.body.data.id });
  assert.equal(assignment.status, 201);
  await User.updateOne({ _id: lecturer._id }, { lecturerStatus: 'SUSPENDED' });
  await Semester.updateOne({ _id: semester.body.data.id }, { academicYearId: laterYear.body.data.id });
  const student = await login('student@example.test');
  const lecturerSession = await login('lecturer@example.test');
  assert.equal((await student.agent.get('/api/academic/admin/reconciliation')).status, 403);
  assert.equal((await lecturerSession.agent.get('/api/academic/admin/reconciliation')).status, 403);
  const report = await session.agent.get('/api/academic/admin/reconciliation');
  assert.equal(report.status, 200);
  const codes = report.body.data.issues.map((item) => item.issue);
  assert.equal(codes.includes('STUDENT_WITHOUT_ACADEMIC_CONTEXT'), true);
  assert.equal(codes.includes('ACTIVE_ASSIGNMENT_FOR_INELIGIBLE_LECTURER'), true);
  assert.equal(codes.includes('OFFERING_SEMESTER_YEAR_MISMATCH'), true);
  assert.equal(JSON.stringify(report.body.data).includes('student@example.test'), false);
  const stillAssigned = await LecturerAssignment.findById(assignment.body.data.id);
  assert.equal(stillAssigned.isActive, true);
});

dbTest('a new batch has no academic period until one is assigned explicitly', async () => {
  const session = await bootstrapDepartment();
  const missing = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22', name: '22 batch' });
  assert.equal(missing.status, 201);
  assert.equal(missing.body.data.currentAcademicYearId, null);
  assert.equal(missing.body.data.currentSemesterId, null);
  assert.equal(missing.body.data.academicContextVerifiedAt, null);

  const year2 = await createPeriod(session, 2, 'Year 2', 1, 'Year 2 Semester 1');
  const year1 = await createPeriod(session, 1, 'Year 1', 1, 'Year 1 Semester 1');
  const created = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22ICT', name: '22 ICT' });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.currentAcademicYearId, null);
  assert.equal(created.body.data.currentSemesterId, null);

  const forced = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      code: '23ICT',
      name: '23 ICT',
      currentAcademicYearId: year2.year.id,
      currentSemesterId: year2.semester.id,
    });
  assert.equal(forced.status, 400);

  const legacy = await Batch.create({
    departmentId: session.department.id,
    code: '21ICT',
    name: '21 ICT',
    status: 'ACTIVE',
  });
  const viewed = await session.agent.get(`/api/academic/batches/${legacy._id}`);
  assert.equal(viewed.status, 200);
  assert.equal(viewed.body.data.currentAcademicYearId, null);
  assert.equal(viewed.body.data.currentSemesterId, null);
  assert.equal(viewed.body.data.studentCount, 0);
  assert.equal(viewed.body.data.academicContextVerifiedAt, null);

  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'student@example.test',
    departmentId: session.department.id,
  });
  const context = await session.agent
    .post('/api/academic/students')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      userId: String(student._id),
      registrationNumber: 'SEU/IS/21/ICT/001',
      batchId: String(legacy._id),
      currentAcademicYearId: year1.year.id,
      currentSemesterId: year1.semester.id,
    });
  assert.equal(context.status, 201);
  const historyBefore = await StudentAcademicHistory.countDocuments({ userId: student._id });

  const mismatch = await session.agent
    .post(`/api/academic/batches/${legacy._id}/academic-context`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ currentAcademicYearId: year1.year.id, currentSemesterId: year2.semester.id });
  assert.equal(mismatch.status, 400);

  const assigned = await session.agent
    .post(`/api/academic/batches/${legacy._id}/academic-context`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ currentAcademicYearId: year2.year.id, currentSemesterId: year2.semester.id });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.body.data.studentCount, 1);

  const storedStudent = await StudentAcademicContext.findById(context.body.data.id);
  assert.equal(String(storedStudent.currentAcademicYearId), year1.year.id);
  assert.equal(String(storedStudent.registrationNumber), 'SEU/IS/21/ICT/001');
  assert.equal(await StudentAcademicHistory.countDocuments({ userId: student._id }), historyBefore);

  const again = await session.agent
    .post(`/api/academic/batches/${legacy._id}/academic-context`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ currentAcademicYearId: year1.year.id, currentSemesterId: year1.semester.id });
  assert.equal(again.status, 409);

  const patched = await session.agent
    .patch(`/api/academic/batches/${legacy._id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ currentAcademicYearId: year1.year.id, currentSemesterId: year1.semester.id });
  assert.equal(patched.status, 400);

  const studentSession = await login('student@example.test');
  const denied = await studentSession.agent
    .post(`/api/academic/batches/${legacy._id}/academic-context`)
    .set('X-CSRF-Token', studentSession.csrfToken)
    .send({ currentAcademicYearId: year1.year.id, currentSemesterId: year1.semester.id });
  assert.equal(denied.status, 403);

  const outsider = await session.agent.get(`/api/academic/batches/${legacy._id}`);
  assert.equal(outsider.body.data.code, '21ICT');
});

dbTest('concurrent batch context assignment keeps a single winner', async () => {
  const session = await bootstrapDepartment();
  const year1 = await createPeriod(session, 1, 'Year 1', 1, 'Year 1 Semester 1');
  const year2 = await createPeriod(session, 2, 'Year 2', 1, 'Year 2 Semester 1');
  const legacy = await Batch.create({
    departmentId: session.department.id,
    code: '21ICT',
    name: '21 ICT',
    status: 'ACTIVE',
  });
  const assign = (period) =>
    session.agent
      .post(`/api/academic/batches/${legacy._id}/academic-context`)
      .set('X-CSRF-Token', session.csrfToken)
      .send({
        currentAcademicYearId: period.year.id,
        currentSemesterId: period.semester.id,
      });
  const [first, second] = await Promise.all([assign(year1), assign(year2)]);
  const responses = [first, second];
  const succeeded = responses.filter((response) => response.status === 200);
  const conflicts = responses.filter((response) => response.status === 409);
  assert.equal(succeeded.length, 1);
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0].body.error.message, /already has a verified academic context/);

  const stored = await Batch.findById(legacy._id);
  assert.equal(String(stored.currentAcademicYearId), succeeded[0].body.data.currentAcademicYearId);
  assert.equal(String(stored.currentSemesterId), succeeded[0].body.data.currentSemesterId);
  assert.ok(stored.academicContextVerifiedAt);
  const audits = await AuditEvent.countDocuments({
    action: 'academic.batch.assign-context',
    entityId: String(legacy._id),
  });
  assert.equal(audits, 1);
});

dbTest('editing a batch period changes only the batch', async () => {
  const session = await bootstrapDepartment('period-edit@example.test');
  const year1 = await createPeriod(session, 1, 'Year 1', 1, 'Semester 1');
  const year2 = await createPeriod(session, 2, 'Year 2', 1, 'Semester 1');
  const created = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '24ICT', name: '24 ICT' });
  assert.equal(created.status, 201);
  const batchId = created.body.data.id;
  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'period-student@example.test',
    departmentId: session.department.id,
  });
  const context = await session.agent
    .post('/api/academic/students')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      userId: String(student._id),
      registrationNumber: 'SEU/IS/24/ICT/001',
      batchId,
      currentAcademicYearId: year1.year.id,
      currentSemesterId: year1.semester.id,
    });
  assert.equal(context.status, 201);
  const historyBefore = await StudentAcademicHistory.countDocuments({ userId: student._id });

  const tooSoon = await session.agent
    .patch(`/api/academic/batches/${batchId}/academic-context`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ currentAcademicYearId: year2.year.id, currentSemesterId: year2.semester.id });
  assert.equal(tooSoon.status, 409);

  await verifyBatchAt(session, batchId, year1.year.id, year1.semester.id);
  const revised = await session.agent
    .patch(`/api/academic/batches/${batchId}/academic-context`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ currentAcademicYearId: year2.year.id, currentSemesterId: year2.semester.id });
  assert.equal(revised.status, 200);
  assert.equal(revised.body.data.currentAcademicYearId, year2.year.id);
  assert.equal(revised.body.data.currentSemesterId, year2.semester.id);
  assert.ok(revised.body.data.academicContextVerifiedAt);

  const storedStudent = await StudentAcademicContext.findById(context.body.data.id);
  assert.equal(String(storedStudent.currentAcademicYearId), year1.year.id);
  assert.equal(String(storedStudent.currentSemesterId), year1.semester.id);
  assert.equal(await StudentAcademicHistory.countDocuments({ userId: student._id }), historyBefore);
  const audits = await AuditEvent.countDocuments({
    action: 'academic.batch.revise-context',
    entityId: String(batchId),
  });
  assert.equal(audits, 1);
});

dbTest('legacy batches with missing or explicit null context fields can be assigned once', async () => {
  const session = await bootstrapDepartment();
  const year1 = await createPeriod(session, 1, 'Year 1', 1, 'Year 1 Semester 1');
  const explicitNull = await Batch.create({
    departmentId: session.department.id,
    code: '21ICT',
    name: '21 ICT',
    status: 'ACTIVE',
    currentAcademicYearId: null,
    currentSemesterId: null,
    academicContextVerifiedAt: null,
  });
  const storedNull = await Batch.collection.findOne({ _id: explicitNull._id });
  assert.equal(storedNull.currentAcademicYearId, null);
  assert.equal(storedNull.academicContextVerifiedAt, null);

  const missingFields = await Batch.collection.insertOne({
    departmentId: explicitNull.departmentId,
    code: '20ICT',
    name: '20 ICT',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const storedMissing = await Batch.collection.findOne({ _id: missingFields.insertedId });
  assert.equal(Object.hasOwn(storedMissing, 'currentAcademicYearId'), false);
  assert.equal(Object.hasOwn(storedMissing, 'currentSemesterId'), false);
  assert.equal(Object.hasOwn(storedMissing, 'academicContextVerifiedAt'), false);

  const assign = (id) =>
    session.agent
      .post(`/api/academic/batches/${id}/academic-context`)
      .set('X-CSRF-Token', session.csrfToken)
      .send({
        currentAcademicYearId: year1.year.id,
        currentSemesterId: year1.semester.id,
      });
  const nullAssigned = await assign(explicitNull._id);
  const missingAssigned = await assign(missingFields.insertedId);
  assert.equal(nullAssigned.status, 200);
  assert.equal(missingAssigned.status, 200);
  assert.equal(nullAssigned.body.data.currentAcademicYearId, year1.year.id);
  assert.equal(missingAssigned.body.data.currentSemesterId, year1.semester.id);

  const nullAgain = await assign(explicitNull._id);
  const missingAgain = await assign(missingFields.insertedId);
  assert.equal(nullAgain.status, 409);
  assert.equal(missingAgain.status, 409);
});

async function createSubject(session, code, name = code) {
  const response = await session.agent
    .post('/api/academic/subjects')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code, name, credits: 3 });
  assert.equal(response.status, 201);
  return response.body.data;
}

dbTest('curriculum mappings are department scoped and reject duplicates', async () => {
  const session = await bootstrapDepartment();
  const year1 = await createPeriod(session, 1, 'Year 1', 1, 'Year 1 Semester 1');
  const year2 = await createPeriod(session, 2, 'Year 2', 1, 'Year 2 Semester 1');
  const subject = await createSubject(session, 'ICT1233', 'Programming');
  const other = await createSubject(session, 'ICT2233', 'Databases');

  const created = await session.agent
    .post('/api/academic/curriculum-mappings')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      subjectId: subject.id,
      academicYearId: year1.year.id,
      semesterId: year1.semester.id,
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.subjectId, subject.id);
  assert.equal(created.body.data.status, 'ACTIVE');

  const duplicate = await session.agent
    .post('/api/academic/curriculum-mappings')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      subjectId: subject.id,
      academicYearId: year1.year.id,
      semesterId: year1.semester.id,
    });
  assert.equal(duplicate.status, 409);

  const [raceA, raceB] = await Promise.all([
    session.agent
      .post('/api/academic/curriculum-mappings')
      .set('X-CSRF-Token', session.csrfToken)
      .send({
        subjectId: other.id,
        academicYearId: year1.year.id,
        semesterId: year1.semester.id,
      }),
    session.agent
      .post('/api/academic/curriculum-mappings')
      .set('X-CSRF-Token', session.csrfToken)
      .send({
        subjectId: other.id,
        academicYearId: year1.year.id,
        semesterId: year1.semester.id,
      }),
  ]);
  const raceStatuses = [raceA.status, raceB.status].sort();
  assert.deepEqual(raceStatuses, [201, 409]);

  const mismatch = await session.agent
    .post('/api/academic/curriculum-mappings')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      subjectId: subject.id,
      academicYearId: year1.year.id,
      semesterId: year2.semester.id,
    });
  assert.equal(mismatch.status, 400);

  await createUser({ role: ROLES.DEPARTMENT_ADMINISTRATOR, email: 'admin-b@example.test' });
  const sessionB = await login('admin-b@example.test');
  await sessionB.agent
    .post('/api/academic/departments')
    .set('X-CSRF-Token', sessionB.csrfToken)
    .send({ code: 'ENG', name: 'English' });
  const yearB = await createPeriod(sessionB, 1, 'Year 1', 1, 'Semester 1');
  const foreignSubject = await createSubject(sessionB, 'ENG1001', 'English');
  const foreignRef = await session.agent
    .post('/api/academic/curriculum-mappings')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      subjectId: foreignSubject.id,
      academicYearId: year1.year.id,
      semesterId: year1.semester.id,
    });
  assert.equal(foreignRef.status, 404);
  const foreignYear = await session.agent
    .post('/api/academic/curriculum-mappings')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      subjectId: subject.id,
      academicYearId: yearB.year.id,
      semesterId: year1.semester.id,
    });
  assert.equal(foreignYear.status, 404);

  const cross = await sessionB.agent
    .patch(`/api/academic/curriculum-mappings/${created.body.data.id}`)
    .set('X-CSRF-Token', sessionB.csrfToken)
    .send({ status: 'ARCHIVED' });
  assert.equal(cross.status, 404);
  const listed = await sessionB.agent.get('/api/academic/curriculum-mappings');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.items.length, 0);

  const identity = await session.agent
    .patch(`/api/academic/curriculum-mappings/${created.body.data.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ subjectId: other.id });
  assert.equal(identity.status, 400);
  const archived = await session.agent
    .patch(`/api/academic/curriculum-mappings/${created.body.data.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });
  assert.equal(archived.status, 200);
  assert.equal(archived.body.data.status, 'ARCHIVED');
  assert.equal(archived.body.data.subjectId, subject.id);

  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'student@example.test',
    departmentId: session.department.id,
  });
  const studentSession = await login('student@example.test');
  const denied = await studentSession.agent
    .post('/api/academic/curriculum-mappings')
    .set('X-CSRF-Token', studentSession.csrfToken)
    .send({
      subjectId: subject.id,
      academicYearId: year1.year.id,
      semesterId: year1.semester.id,
    });
  assert.equal(denied.status, 403);
  assert.equal((await request(app).get('/api/academic/curriculum-mappings')).status, 401);
  assert.equal(student.role, ROLES.STUDENT);
});

dbTest('offering generation uses the verified current period and does not rewrite existing offerings', async () => {
  const session = await bootstrapDepartment();
  const year1 = await createPeriod(session, 1, 'Year 1', 1, 'Year 1 Semester 1');
  const year2 = await createPeriod(session, 2, 'Year 2', 1, 'Year 2 Semester 1');
  const currentSubject = await createSubject(session, 'ICT1101', 'Current subject');
  const laterSubject = await createSubject(session, 'ICT2101', 'Later subject');
  const existingSubject = await createSubject(session, 'ICT1102', 'Existing subject');
  const inactiveSubject = await createSubject(session, 'ICT1103', 'Inactive subject');

  const legacy = await Batch.create({
    departmentId: session.department.id,
    code: '21ICT',
    name: '21 ICT',
    status: 'ACTIVE',
  });
  const unverified = await session.agent
    .post(`/api/academic/batches/${legacy._id}/offering-generation`)
    .set('X-CSRF-Token', session.csrfToken);
  assert.equal(unverified.status, 400);
  const stillLegacy = await Batch.findById(legacy._id);
  assert.equal(stillLegacy.currentAcademicYearId, null);
  assert.equal(stillLegacy.academicContextVerifiedAt, null);

  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22ICT', name: '22 ICT' });
  assert.equal(batch.status, 201);
  await verifyBatchAt(session, batch.body.data.id, year1.year.id, year1.semester.id);

  const archivedBatch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '23ICT', name: '23 ICT' });
  await session.agent
    .patch(`/api/academic/batches/${archivedBatch.body.data.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });
  const archivedGeneration = await session.agent
    .post(`/api/academic/batches/${archivedBatch.body.data.id}/offering-generation`)
    .set('X-CSRF-Token', session.csrfToken);
  assert.equal(archivedGeneration.status, 400);

  const empty = await session.agent
    .post(`/api/academic/batches/${batch.body.data.id}/offering-generation`)
    .set('X-CSRF-Token', session.csrfToken);
  assert.equal(empty.status, 200);
  assert.equal(empty.body.data.created, 0);
  assert.equal(empty.body.data.alreadyExisted, 0);
  assert.equal(empty.body.data.skipped, 0);
  assert.equal(await SubjectOffering.countDocuments({ batchId: batch.body.data.id }), 0);

  const map = (subjectId, period) =>
    session.agent
      .post('/api/academic/curriculum-mappings')
      .set('X-CSRF-Token', session.csrfToken)
      .send({
        subjectId,
        academicYearId: period.year.id,
        semesterId: period.semester.id,
      });
  assert.equal((await map(currentSubject.id, year1)).status, 201);
  assert.equal((await map(laterSubject.id, year2)).status, 201);
  assert.equal((await map(existingSubject.id, year1)).status, 201);
  const inactiveMapping = await map(inactiveSubject.id, year1);
  assert.equal(inactiveMapping.status, 201);
  await session.agent
    .patch(`/api/academic/subjects/${inactiveSubject.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });

  const offering = await session.agent
    .post('/api/academic/subject-offerings')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      subjectId: existingSubject.id,
      batchId: batch.body.data.id,
      academicYearId: year1.year.id,
      semesterId: year1.semester.id,
    });
  assert.equal(offering.status, 201);
  const lecturer = await createUser({
    role: ROLES.LECTURER,
    email: 'lecturer@example.test',
    departmentId: session.department.id,
    lecturerStatus: 'VERIFIED',
  });
  const assignment = await session.agent
    .post('/api/academic/lecturer-assignments')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ lecturerUserId: String(lecturer._id), subjectOfferingId: offering.body.data.id });
  assert.equal(assignment.status, 201);
  const beforeOffering = await SubjectOffering.findById(offering.body.data.id);
  const beforeAssignment = await LecturerAssignment.findById(assignment.body.data.id);

  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'student@example.test',
    departmentId: session.department.id,
  });
  const context = await session.agent
    .post('/api/academic/students')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      userId: String(student._id),
      registrationNumber: 'SEU/IS/22/ICT/001',
      batchId: batch.body.data.id,
      currentAcademicYearId: year1.year.id,
      currentSemesterId: year1.semester.id,
    });
  assert.equal(context.status, 201);
  const historyBefore = await StudentAcademicHistory.countDocuments({ userId: student._id });

  const preview = await session.agent.get(`/api/academic/batches/${batch.body.data.id}/offering-generation`);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data.academicYearId, year1.year.id);
  const previewCodes = preview.body.data.subjects.map((item) => item.subjectCode).sort();
  assert.deepEqual(previewCodes, ['ICT1101', 'ICT1102']);
  assert.equal(preview.body.data.skipped.length, 1);

  const generated = await session.agent
    .post(`/api/academic/batches/${batch.body.data.id}/offering-generation`)
    .set('X-CSRF-Token', session.csrfToken);
  assert.equal(generated.status, 200);
  assert.equal(generated.body.data.created, 1);
  assert.equal(generated.body.data.alreadyExisted, 1);
  assert.equal(generated.body.data.skipped, 1);
  assert.equal(generated.body.data.createdSubjects[0].subjectCode, 'ICT1101');
  assert.equal(generated.body.data.existingSubjects[0].subjectCode, 'ICT1102');

  const repeated = await session.agent
    .post(`/api/academic/batches/${batch.body.data.id}/offering-generation`)
    .set('X-CSRF-Token', session.csrfToken);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.data.created, 0);
  assert.equal(repeated.body.data.alreadyExisted, 2);
  assert.equal(await SubjectOffering.countDocuments({ batchId: batch.body.data.id }), 2);
  assert.equal(
    await SubjectOffering.countDocuments({ batchId: batch.body.data.id, academicYearId: year2.year.id }),
    0,
  );

  const afterOffering = await SubjectOffering.findById(offering.body.data.id);
  const afterAssignment = await LecturerAssignment.findById(assignment.body.data.id);
  assert.equal(String(afterOffering.updatedAt), String(beforeOffering.updatedAt));
  assert.equal(afterOffering.status, beforeOffering.status);
  assert.equal(afterAssignment.isActive, beforeAssignment.isActive);
  assert.equal(String(afterAssignment.lecturerUserId), String(beforeAssignment.lecturerUserId));
  assert.equal(String(afterAssignment.updatedAt), String(beforeAssignment.updatedAt));

  const storedStudent = await StudentAcademicContext.findById(context.body.data.id);
  assert.equal(String(storedStudent.currentAcademicYearId), year1.year.id);
  assert.equal(String(storedStudent.registrationNumber), 'SEU/IS/22/ICT/001');
  assert.equal(await StudentAcademicHistory.countDocuments({ userId: student._id }), historyBefore);

  const studentSession = await login('student@example.test');
  const denied = await studentSession.agent
    .post(`/api/academic/batches/${batch.body.data.id}/offering-generation`)
    .set('X-CSRF-Token', studentSession.csrfToken);
  assert.equal(denied.status, 403);
  assert.equal(
    (await request(app).post(`/api/academic/batches/${batch.body.data.id}/offering-generation`)).status,
    401,
  );
});

dbTest('period assign offers the selected curriculum and leaves an extra subject alone', async () => {
  const session = await bootstrapDepartment('offerings-admin@example.test');
  const year1 = await createPeriod(session, 1, 'Year 1', 1, 'Semester 1');
  const year2 = await createPeriod(session, 2, 'Year 2', 1, 'Semester 1');
  const year3 = await createPeriod(session, 3, 'Year 3', 1, 'Semester 1');
  const first = await createSubject(session, 'CIS11012', 'Essentials');
  const second = await createSubject(session, 'CIS11022', 'Database');
  const later = await createSubject(session, 'CIS21012', 'Later');
  const extra = await createSubject(session, 'CIS11099', 'Extra');
  const software = await createSubject(session, 'SWT31012', 'Software');
  const network = await createSubject(session, 'NST31011', 'Network');
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '23ICT', name: '23 ICT' });
  assert.equal(batch.status, 201);

  async function map(subjectId, period, specialization) {
    const response = await session.agent
      .post('/api/academic/curriculum-mappings')
      .set('X-CSRF-Token', session.csrfToken)
      .send({
        subjectId,
        academicYearId: period.year.id,
        semesterId: period.semester.id,
        ...(specialization ? { specialization } : {}),
      });
    assert.equal(response.status, 201, JSON.stringify(response.body));
  }
  await map(first.id, year1);
  await map(second.id, year1);
  await map(later.id, year2);
  await map(software.id, year3, 'SWT');
  await map(network.id, year3, 'NST');

  const assign = (period) =>
    session.agent
      .post('/api/academic/subject-offerings/from-curriculum')
      .set('X-CSRF-Token', session.csrfToken)
      .send({
        batchId: batch.body.data.id,
        academicYearId: period.year.id,
        semesterId: period.semester.id,
      });

  const firstAssign = await assign(year1);
  assert.equal(firstAssign.status, 200, JSON.stringify(firstAssign.body));
  assert.equal(firstAssign.body.data.created, 2);
  assert.equal(firstAssign.body.data.alreadyExisted, 0);
  assert.deepEqual(
    firstAssign.body.data.createdSubjects.map((item) => item.subjectCode).sort(),
    ['CIS11012', 'CIS11022'],
  );
  assert.equal(await CurriculumMapping.countDocuments({ subjectId: extra.id }), 0);

  const again = await assign(year1);
  assert.equal(again.body.data.created, 0);
  assert.equal(again.body.data.alreadyExisted, 2);
  assert.equal(await SubjectOffering.countDocuments({ batchId: batch.body.data.id }), 2);

  const archived = await SubjectOffering.findOne({ subjectId: first.id, batchId: batch.body.data.id });
  await session.agent
    .patch(`/api/academic/subject-offerings/${archived._id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });
  const afterArchive = await assign(year1);
  assert.equal(afterArchive.body.data.created, 0);
  assert.equal(afterArchive.body.data.alreadyExisted, 2);
  assert.equal((await SubjectOffering.findById(archived._id)).status, 'ARCHIVED');

  const one = await session.agent
    .post('/api/academic/subject-offerings')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      subjectId: extra.id,
      batchId: batch.body.data.id,
      academicYearId: year1.year.id,
      semesterId: year1.semester.id,
    });
  assert.equal(one.status, 201);
  assert.equal(await CurriculumMapping.countDocuments({ subjectId: extra.id }), 0);
  assert.equal(await SubjectOffering.countDocuments({ batchId: batch.body.data.id, subjectId: extra.id }), 1);

  const specialized = await assign(year3);
  assert.equal(specialized.body.data.created, 0);
  assert.equal(specialized.body.data.skipped, 2);
  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'swt-student@example.test',
    departmentId: session.department.id,
  });
  const context = await session.agent
    .post('/api/academic/students')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      userId: String(student._id),
      registrationNumber: 'SEU/IS/23/ICT/001',
      batchId: batch.body.data.id,
      currentAcademicYearId: year3.year.id,
      currentSemesterId: year3.semester.id,
      specialization: 'SWT',
    });
  assert.equal(context.status, 201, JSON.stringify(context.body));
  const withStudent = await assign(year3);
  assert.equal(withStudent.body.data.created, 1);
  assert.equal(withStudent.body.data.createdSubjects[0].subjectCode, 'SWT31012');
  assert.equal(withStudent.body.data.skipped, 1);
});

async function createSemesterForYear(session, yearId, sequence, name) {
  const semester = await session.agent
    .post('/api/academic/semesters')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ academicYearId: yearId, sequence, name });
  assert.equal(semester.status, 201);
  return semester.body.data;
}

const PROGRESSION_STEPS = [
  [1, 2],
  [2, 1],
  [2, 2],
  [3, 1],
  [3, 2],
  [4, 1],
  [4, 2],
];

dbTest('batch progression follows the eight-semester sequence and keeps unrelated records', async () => {
  const session = await bootstrapDepartment();
  const years = [];
  for (const sequence of [1, 2, 3, 4]) {
    const year = await session.agent
      .post('/api/academic/academic-years')
      .set('X-CSRF-Token', session.csrfToken)
      .send({ sequence, name: `Year ${sequence}` });
    assert.equal(year.status, 201);
    const first = await createSemesterForYear(session, year.body.data.id, 1, `Year ${sequence} Semester 1`);
    const second = await createSemesterForYear(session, year.body.data.id, 2, `Year ${sequence} Semester 2`);
    years.push({ year: year.body.data, semesters: [first, second] });
  }

  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22ICT', name: '22 ICT' });
  assert.equal(batch.status, 201);
  await verifyBatchAt(session, batch.body.data.id, years[0].year.id, years[0].semesters[0].id);
  const subject = await createSubject(session, 'ICT1101', 'Programming');
  const mapping = await session.agent
    .post('/api/academic/curriculum-mappings')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      subjectId: subject.id,
      academicYearId: years[0].year.id,
      semesterId: years[0].semesters[0].id,
    });
  assert.equal(mapping.status, 201);
  const offering = await session.agent
    .post('/api/academic/subject-offerings')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      subjectId: subject.id,
      batchId: batch.body.data.id,
      academicYearId: years[0].year.id,
      semesterId: years[0].semesters[0].id,
    });
  assert.equal(offering.status, 201);
  const lecturer = await createUser({
    role: ROLES.LECTURER,
    email: 'lecturer@example.test',
    departmentId: session.department.id,
    lecturerStatus: 'VERIFIED',
  });
  const assignment = await session.agent
    .post('/api/academic/lecturer-assignments')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ lecturerUserId: String(lecturer._id), subjectOfferingId: offering.body.data.id });
  assert.equal(assignment.status, 201);

  const active = await createUser({
    role: ROLES.STUDENT,
    email: 'active@example.test',
    departmentId: session.department.id,
  });
  const archivedStudent = await createUser({
    role: ROLES.STUDENT,
    email: 'archived@example.test',
    departmentId: session.department.id,
  });
  const aheadStudent = await createUser({
    role: ROLES.STUDENT,
    email: 'ahead@example.test',
    departmentId: session.department.id,
  });
  const createContext = (user, emailPrefix, registration) =>
    session.agent
      .post('/api/academic/students')
      .set('X-CSRF-Token', session.csrfToken)
      .send({
        userId: String(user._id),
        registrationNumber: registration,
        batchId: batch.body.data.id,
        currentAcademicYearId: years[0].year.id,
        currentSemesterId: years[0].semesters[0].id,
      });
  const activeContext = await createContext(active, 'active', 'SEU/IS/22/ICT/001');
  const archivedContext = await createContext(archivedStudent, 'archived', 'SEU/IS/22/ICT/002');
  const aheadContext = await createContext(aheadStudent, 'ahead', 'SEU/IS/22/ICT/003');
  assert.equal(activeContext.status, 201);
  assert.equal(archivedContext.status, 201);
  assert.equal(aheadContext.status, 201);
  const archivedUpdate = await session.agent
    .patch(`/api/academic/students/${archivedContext.body.data.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });
  assert.equal(archivedUpdate.status, 200);
  const aheadUpdate = await session.agent
    .patch(`/api/academic/students/${aheadContext.body.data.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      currentAcademicYearId: years[1].year.id,
      currentSemesterId: years[1].semesters[0].id,
    });
  assert.equal(aheadUpdate.status, 200);

  const result = await AcademicResult.create({
    departmentId: session.department.id,
    studentUserId: active._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    subjectId: subject.id,
    subjectCode: 'ICT1101',
    subjectOfferingId: offering.body.data.id,
    studentAcademicYearId: years[0].year.id,
    studentSemesterId: years[0].semesters[0].id,
    sourceBatchId: batch.body.data.id,
    resultCode: 'A',
    version: 1,
    isEca: false,
  });
  const incomplete = await IncompleteCa.create({
    studentUserId: active._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    subjectId: subject.id,
    subjectCode: 'ICT1101',
    academicYearId: years[0].year.id,
    semesterId: years[0].semesters[0].id,
    academicResultId: result._id,
    departmentId: session.department.id,
    status: 'OPEN',
  });
  const beforeOffering = await SubjectOffering.findById(offering.body.data.id);
  const beforeAssignment = await LecturerAssignment.findById(assignment.body.data.id);
  const beforeMapping = await CurriculumMapping.findById(mapping.body.data.id);

  const skipped = await session.agent
    .post(`/api/academic/batches/${batch.body.data.id}/progression`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      currentAcademicYearId: years[1].year.id,
      currentSemesterId: years[1].semesters[0].id,
    });
  assert.equal(skipped.status, 400);

  for (const [index, [yearSequence, semesterSequence]] of PROGRESSION_STEPS.entries()) {
    const progressed = await session.agent
      .post(`/api/academic/batches/${batch.body.data.id}/progression`)
      .set('X-CSRF-Token', session.csrfToken)
      .send({});
    assert.equal(progressed.status, 200);
    assert.equal(progressed.body.data.to.academicYearSequence, yearSequence);
    assert.equal(progressed.body.data.to.semesterSequence, semesterSequence);
    if (index === 0) {
      assert.equal(progressed.body.data.studentsAdvanced, 1);
      const storedAhead = await StudentAcademicContext.findById(aheadContext.body.data.id);
      const storedArchived = await StudentAcademicContext.findById(archivedContext.body.data.id);
      assert.equal(String(storedAhead.currentAcademicYearId), years[1].year.id);
      assert.equal(String(storedAhead.currentSemesterId), years[1].semesters[0].id);
      assert.equal(String(storedArchived.currentAcademicYearId), years[0].year.id);
      assert.equal(String(storedArchived.currentSemesterId), years[0].semesters[0].id);
      assert.equal(storedArchived.status, 'ARCHIVED');
    }
  }
  const firstStepHistory = await StudentAcademicHistory.countDocuments({
    studentAcademicContextId: activeContext.body.data.id,
    academicYearId: years[0].year.id,
    semesterId: years[0].semesters[1].id,
  });
  assert.equal(firstStepHistory, 1);

  const terminal = await session.agent
    .post(`/api/academic/batches/${batch.body.data.id}/progression`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({});
  assert.equal(terminal.status, 409);
  const preview = await session.agent.get(`/api/academic/batches/${batch.body.data.id}/progression`);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data.canProgress, false);

  const storedActive = await StudentAcademicContext.findById(activeContext.body.data.id);
  assert.equal(String(storedActive.currentAcademicYearId), years[3].year.id);
  assert.equal(String(storedActive.currentSemesterId), years[3].semesters[1].id);
  assert.equal(storedActive.registrationNumber, 'SEU/IS/22/ICT/001');
  assert.equal(String(storedActive.batchId), batch.body.data.id);
  assert.equal(await StudentAcademicHistory.countDocuments({ studentAcademicContextId: storedActive._id }), 8);

  const storedArchived = await StudentAcademicContext.findById(archivedContext.body.data.id);
  assert.equal(storedArchived.status, 'ARCHIVED');
  assert.equal(String(storedArchived.currentAcademicYearId), years[0].year.id);
  assert.equal(String(storedArchived.currentSemesterId), years[0].semesters[0].id);

  const storedResult = await AcademicResult.findById(result._id);
  assert.equal(String(storedResult.studentAcademicYearId), years[0].year.id);
  assert.equal(String(storedResult.studentSemesterId), years[0].semesters[0].id);
  assert.equal(storedResult.resultCode, 'A');
  const storedCa = await IncompleteCa.findById(incomplete._id);
  assert.equal(String(storedCa.academicYearId), years[0].year.id);
  assert.equal(storedCa.status, 'OPEN');
  const afterOffering = await SubjectOffering.findById(offering.body.data.id);
  const afterAssignment = await LecturerAssignment.findById(assignment.body.data.id);
  const afterMapping = await CurriculumMapping.findById(mapping.body.data.id);
  assert.equal(String(afterOffering.updatedAt), String(beforeOffering.updatedAt));
  assert.equal(String(afterAssignment.updatedAt), String(beforeAssignment.updatedAt));
  assert.equal(String(afterMapping.updatedAt), String(beforeMapping.updatedAt));
  assert.equal(await SubjectOffering.countDocuments({ batchId: batch.body.data.id }), 1);
});

dbTest('batch progression rejects unverified, archived, and incomplete periods', async () => {
  const session = await bootstrapDepartment();
  const legacy = await Batch.create({
    departmentId: session.department.id,
    code: '21ICT',
    name: '21 ICT',
    status: 'ACTIVE',
  });
  const unverified = await session.agent
    .post(`/api/academic/batches/${legacy._id}/progression`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({});
  assert.equal(unverified.status, 400);
  assert.equal((await Batch.findById(legacy._id)).academicContextVerifiedAt, null);

  const year = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 1, name: 'Year 1' });
  const semester = await createSemesterForYear(session, year.body.data.id, 1, 'Semester 1');
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22ICT', name: '22 ICT' });
  await verifyBatchAt(session, batch.body.data.id, year.body.data.id, semester.id);
  const missingNext = await session.agent
    .post(`/api/academic/batches/${batch.body.data.id}/progression`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({});
  assert.equal(missingNext.status, 400);

  const second = await createSemesterForYear(session, year.body.data.id, 2, 'Semester 2');
  const blockedNextArchive = await session.agent
    .patch(`/api/academic/semesters/${second.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });
  assert.equal(blockedNextArchive.status, 409);
  assert.equal((await Semester.findById(second.id)).status, 'ACTIVE');

  await session.agent
    .patch(`/api/academic/batches/${batch.body.data.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });
  const archived = await session.agent
    .post(`/api/academic/batches/${batch.body.data.id}/progression`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({});
  assert.equal(archived.status, 400);
  assert.equal(semester.sequence, 1);

  // Inactive next period via supported ops: archive Semester 2 before any active batch needs it.
  await createUser({ role: ROLES.DEPARTMENT_ADMINISTRATOR, email: 'admin-inactive-next@example.test' });
  const sessionInactive = await login('admin-inactive-next@example.test');
  const deptInactive = await sessionInactive.agent
    .post('/api/academic/departments')
    .set('X-CSRF-Token', sessionInactive.csrfToken)
    .send({ code: 'INACT', name: 'Inactive Next Dept' });
  assert.equal(deptInactive.status, 201);
  const yearInactive = await sessionInactive.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', sessionInactive.csrfToken)
    .send({ sequence: 1, name: 'Year 1' });
  assert.equal(yearInactive.status, 201);
  await createSemesterForYear(sessionInactive, yearInactive.body.data.id, 1, 'Semester 1');
  const nextInactive = await createSemesterForYear(sessionInactive, yearInactive.body.data.id, 2, 'Semester 2');
  const archivedNext = await sessionInactive.agent
    .patch(`/api/academic/semesters/${nextInactive.id}`)
    .set('X-CSRF-Token', sessionInactive.csrfToken)
    .send({ status: 'ARCHIVED' });
  assert.equal(archivedNext.status, 200);
  assert.equal((await Semester.findById(nextInactive.id)).status, 'ARCHIVED');
  const batchInactive = await sessionInactive.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', sessionInactive.csrfToken)
    .send({ code: '23ICT', name: '23 ICT' });
  assert.equal(batchInactive.status, 201);
  const firstInactive = await Semester.findOne({ academicYearId: yearInactive.body.data.id, sequence: 1 });
  await verifyBatchAt(sessionInactive, batchInactive.body.data.id, yearInactive.body.data.id, firstInactive._id);
  const inactiveNext = await sessionInactive.agent
    .post(`/api/academic/batches/${batchInactive.body.data.id}/progression`)
    .set('X-CSRF-Token', sessionInactive.csrfToken)
    .send({});
  assert.equal(inactiveNext.status, 400);

  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'student@example.test',
    departmentId: session.department.id,
  });
  const studentSession = await login('student@example.test');
  assert.equal(
    (
      await studentSession.agent
        .post(`/api/academic/batches/${batch.body.data.id}/progression`)
        .set('X-CSRF-Token', studentSession.csrfToken)
        .send({})
    ).status,
    403,
  );
  assert.equal((await request(app).post(`/api/academic/batches/${batch.body.data.id}/progression`)).status, 401);
  assert.equal((await request(app).get(`/api/academic/batches/${batch.body.data.id}/progression`)).status, 401);
  assert.equal(student.role, ROLES.STUDENT);

  await createUser({ role: ROLES.DEPARTMENT_ADMINISTRATOR, email: 'admin-b@example.test' });
  const sessionB = await login('admin-b@example.test');
  await sessionB.agent
    .post('/api/academic/departments')
    .set('X-CSRF-Token', sessionB.csrfToken)
    .send({ code: 'ENG', name: 'English' });
  const cross = await sessionB.agent
    .post(`/api/academic/batches/${batch.body.data.id}/progression`)
    .set('X-CSRF-Token', sessionB.csrfToken)
    .send({});
  assert.equal(cross.status, 404);
});

dbTest('concurrent batch progression advances the batch only once', async () => {
  const session = await bootstrapDepartment();
  const year = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 1, name: 'Year 1' });
  await createSemesterForYear(session, year.body.data.id, 1, 'Semester 1');
  const second = await createSemesterForYear(session, year.body.data.id, 2, 'Semester 2');
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22ICT', name: '22 ICT' });
  const firstSemester = await Semester.findOne({ academicYearId: year.body.data.id, sequence: 1 });
  await verifyBatchAt(session, batch.body.data.id, year.body.data.id, firstSemester._id);
  const progress = () =>
    session.agent
      .post(`/api/academic/batches/${batch.body.data.id}/progression`)
      .set('X-CSRF-Token', session.csrfToken)
      .send({});
  const [first, secondResponse] = await Promise.all([progress(), progress()]);
  const statuses = [first.status, secondResponse.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const stored = await Batch.findById(batch.body.data.id);
  assert.equal(String(stored.currentSemesterId), second.id);
  assert.equal(
    await AuditEvent.countDocuments({ action: 'academic.batch.progress', entityId: String(batch.body.data.id) }),
    1,
  );
});

dbTest('a failed batch progression rolls back the batch and student context', async () => {
  const session = await bootstrapDepartment();
  const year = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 1, name: 'Year 1' });
  const first = await createSemesterForYear(session, year.body.data.id, 1, 'Semester 1');
  await createSemesterForYear(session, year.body.data.id, 2, 'Semester 2');
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22ICT', name: '22 ICT' });
  await verifyBatchAt(session, batch.body.data.id, year.body.data.id, first.id);
  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'student@example.test',
    departmentId: session.department.id,
  });
  const context = await session.agent
    .post('/api/academic/students')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      userId: String(student._id),
      registrationNumber: 'SEU/IS/22/ICT/001',
      batchId: batch.body.data.id,
      currentAcademicYearId: year.body.data.id,
      currentSemesterId: first.id,
    });
  assert.equal(context.status, 201);
  const historyBefore = await StudentAcademicHistory.countDocuments({ userId: student._id });
  const original = StudentAcademicContext.updateMany;
  StudentAcademicContext.updateMany = async () => {
    throw new Error('simulated progression failure');
  };
  try {
    const failed = await session.agent
      .post(`/api/academic/batches/${batch.body.data.id}/progression`)
      .set('X-CSRF-Token', session.csrfToken)
      .send({});
    assert.equal(failed.status, 500);
  } finally {
    StudentAcademicContext.updateMany = original;
  }
  const storedBatch = await Batch.findById(batch.body.data.id);
  const storedStudent = await StudentAcademicContext.findById(context.body.data.id);
  assert.equal(String(storedBatch.currentSemesterId), first.id);
  assert.equal(String(storedStudent.currentSemesterId), first.id);
  assert.equal(await StudentAcademicHistory.countDocuments({ userId: student._id }), historyBefore);
  assert.equal(
    await AuditEvent.countDocuments({ action: 'academic.batch.progress', entityId: String(batch.body.data.id) }),
    0,
  );
});

dbTest('archiving the current period of an active batch is refused', async () => {
  const session = await bootstrapDepartment();
  const year = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 1, name: 'Year 1' });
  const first = await createSemesterForYear(session, year.body.data.id, 1, 'Semester 1');
  await createSemesterForYear(session, year.body.data.id, 2, 'Semester 2');
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22ICT', name: '22 ICT' });
  assert.equal(batch.status, 201);
  await verifyBatchAt(session, batch.body.data.id, year.body.data.id, first.id);

  // Supported admin archive cannot place an active batch on an inactive current period.
  // Progression still validates assertActive on the current pair; that state is guarded at archive time.
  const archivedYear = await session.agent
    .patch(`/api/academic/academic-years/${year.body.data.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });
  assert.equal(archivedYear.status, 409);
  assert.equal((await AcademicYear.findById(year.body.data.id)).status, 'ACTIVE');

  const archivedSemester = await session.agent
    .patch(`/api/academic/semesters/${first.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });
  assert.equal(archivedSemester.status, 409);
  assert.equal((await Semester.findById(first.id)).status, 'ACTIVE');

  const stored = await Batch.findById(batch.body.data.id);
  assert.equal(String(stored.currentSemesterId), first.id);
  assert.equal(String(stored.currentAcademicYearId), year.body.data.id);
});

dbTest('batch progression does not advance active students behind the batch period', async () => {
  const session = await bootstrapDepartment();
  const year = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 1, name: 'Year 1' });
  const first = await createSemesterForYear(session, year.body.data.id, 1, 'Semester 1');
  const second = await createSemesterForYear(session, year.body.data.id, 2, 'Semester 2');
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22ICT', name: '22 ICT' });
  await verifyBatchAt(session, batch.body.data.id, year.body.data.id, first.id);
  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'lagging@example.test',
    departmentId: session.department.id,
  });
  const context = await session.agent
    .post('/api/academic/students')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      userId: String(student._id),
      registrationNumber: 'SEU/IS/22/ICT/099',
      batchId: batch.body.data.id,
      currentAcademicYearId: year.body.data.id,
      currentSemesterId: first.id,
    });
  assert.equal(context.status, 201);

  const step = await session.agent
    .post(`/api/academic/batches/${batch.body.data.id}/progression`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({});
  assert.equal(step.status, 200);
  assert.equal(String((await Batch.findById(batch.body.data.id)).currentSemesterId), second.id);

  const lagging = await StudentAcademicContext.findById(context.body.data.id);
  await StudentAcademicContext.updateOne(
    { _id: lagging._id },
    { $set: { currentAcademicYearId: year.body.data.id, currentSemesterId: first.id } },
  );
  const year2 = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 2, name: 'Year 2' });
  await createSemesterForYear(session, year2.body.data.id, 1, 'Year 2 Semester 1');

  const next = await session.agent
    .post(`/api/academic/batches/${batch.body.data.id}/progression`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({});
  assert.equal(next.status, 200);

  const stored = await StudentAcademicContext.findById(context.body.data.id);
  assert.equal(String(stored.currentAcademicYearId), year.body.data.id);
  assert.equal(String(stored.currentSemesterId), first.id);
  assert.equal(stored.status, 'ACTIVE');
});

dbTest('lecturers cannot preview batch progression', async () => {
  const session = await bootstrapDepartment();
  await createPeriod(session, 1, 'Year 1', 1, 'Semester 1');
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22ICT', name: '22 ICT' });
  await createUser({
    role: ROLES.LECTURER,
    email: 'lecturer@example.test',
    departmentId: session.department.id,
    lecturerStatus: 'VERIFIED',
  });
  const lecturer = await login('lecturer@example.test');
  const preview = await lecturer.agent.get(`/api/academic/batches/${batch.body.data.id}/progression`);
  assert.equal(preview.status, 403);
});

dbTest('a repeated batch progression request cannot apply the same transition twice', async () => {
  const session = await bootstrapDepartment();
  const year = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 1, name: 'Year 1' });
  await createSemesterForYear(session, year.body.data.id, 1, 'Semester 1');
  const second = await createSemesterForYear(session, year.body.data.id, 2, 'Semester 2');
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22ICT', name: '22 ICT' });
  const opening = await Semester.findOne({ academicYearId: year.body.data.id, sequence: 1 });
  await verifyBatchAt(session, batch.body.data.id, year.body.data.id, opening._id);

  const first = await session.agent
    .post(`/api/academic/batches/${batch.body.data.id}/progression`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({});
  assert.equal(first.status, 200);
  assert.equal(String(first.body.data.to.semesterId), second.id);

  const repeat = await session.agent
    .post(`/api/academic/batches/${batch.body.data.id}/progression`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({});
  assert.equal(repeat.status, 400);
  const stored = await Batch.findById(batch.body.data.id);
  assert.equal(String(stored.currentSemesterId), second.id);
  assert.equal(
    await AuditEvent.countDocuments({ action: 'academic.batch.progress', entityId: String(batch.body.data.id) }),
    1,
  );
});

dbTest('batch progression commits when the post-commit audit write fails', async () => {
  const session = await bootstrapDepartment();
  const year = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 1, name: 'Year 1' });
  const first = await createSemesterForYear(session, year.body.data.id, 1, 'Semester 1');
  await createSemesterForYear(session, year.body.data.id, 2, 'Semester 2');
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22ICT', name: '22 ICT' });
  await verifyBatchAt(session, batch.body.data.id, year.body.data.id, first.id);

  const originalCreate = AuditEvent.create;
  AuditEvent.create = async () => {
    throw new Error('simulated audit failure');
  };
  try {
    const progressed = await session.agent
      .post(`/api/academic/batches/${batch.body.data.id}/progression`)
      .set('X-CSRF-Token', session.csrfToken)
      .send({});
    assert.equal(progressed.status, 200);
  } finally {
    AuditEvent.create = originalCreate;
  }

  const stored = await Batch.findById(batch.body.data.id);
  assert.notEqual(String(stored.currentSemesterId), first.id);
  assert.equal(
    await AuditEvent.countDocuments({ action: 'academic.batch.progress', entityId: String(batch.body.data.id) }),
    0,
  );
});

dbTest('duplicate academic year sequence returns conflict', async () => {
  const session = await bootstrapDepartment();
  const first = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 1, name: 'Year 1' });
  assert.equal(first.status, 201);
  const duplicate = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 1, name: 'Another Year 1' });
  assert.equal(duplicate.status, 409);
});

dbTest('archiving a period required by an active batch is refused', async () => {
  const session = await bootstrapDepartment();
  const year = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 1, name: 'Year 1' });
  const first = await createSemesterForYear(session, year.body.data.id, 1, 'Semester 1');
  const second = await createSemesterForYear(session, year.body.data.id, 2, 'Semester 2');
  const year2 = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 2, name: 'Year 2' });
  const later = await createSemesterForYear(session, year2.body.data.id, 1, 'Year 2 Semester 1');
  const batch = await session.agent
    .post('/api/academic/batches')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ code: '22ICT', name: '22 ICT' });
  await verifyBatchAt(session, batch.body.data.id, year.body.data.id, first.id);

  const currentYear = await session.agent
    .patch(`/api/academic/academic-years/${year.body.data.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });
  assert.equal(currentYear.status, 409);
  const currentSemester = await session.agent
    .patch(`/api/academic/semesters/${first.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });
  assert.equal(currentSemester.status, 409);
  const nextSemester = await session.agent
    .patch(`/api/academic/semesters/${second.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });
  assert.equal(nextSemester.status, 409);

  const unused = await session.agent
    .patch(`/api/academic/semesters/${later.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });
  assert.equal(unused.status, 200);
  assert.equal((await Semester.findById(first.id)).status, 'ACTIVE');
  assert.equal((await Semester.findById(later.id)).status, 'ARCHIVED');
});

dbTest('archived semesters and years can be restored or deleted when unreferenced', async () => {
  const session = await bootstrapDepartment();
  const spareYear = await session.agent
    .post('/api/academic/academic-years')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ sequence: 3, name: 'Spare Year' });
  assert.equal(spareYear.status, 201);
  const spareSemester = await createSemesterForYear(session, spareYear.body.data.id, 1, 'Spare Semester 1');
  const archived = await session.agent
    .patch(`/api/academic/semesters/${spareSemester.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });
  assert.equal(archived.status, 200);
  const restored = await session.agent
    .patch(`/api/academic/semesters/${spareSemester.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ACTIVE' });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.data.status, 'ACTIVE');
  const renamed = await session.agent
    .patch(`/api/academic/semesters/${spareSemester.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ name: 'Spare Semester 1 Updated' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.data.name, 'Spare Semester 1 Updated');
  await session.agent
    .patch(`/api/academic/semesters/${spareSemester.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });
  const deleted = await session.agent
    .delete(`/api/academic/semesters/${spareSemester.id}`)
    .set('X-CSRF-Token', session.csrfToken);
  assert.equal(deleted.status, 200);
  assert.equal(await Semester.findById(spareSemester.id), null);
  await session.agent
    .patch(`/api/academic/academic-years/${spareYear.body.data.id}`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ status: 'ARCHIVED' });
  const deletedYear = await session.agent
    .delete(`/api/academic/academic-years/${spareYear.body.data.id}`)
    .set('X-CSRF-Token', session.csrfToken);
  assert.equal(deletedYear.status, 200);
  assert.equal(await AcademicYear.findById(spareYear.body.data.id), null);
});
