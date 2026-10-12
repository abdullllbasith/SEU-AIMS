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
import { SubjectEnrollment } from '../../src/modules/academic-foundation/models/subject-enrollment.model.js';
import { ROLES } from '../../src/shared/constants/roles.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-04c';
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
    infrastructure: { email: { send: async () => ({ accepted: false, provider: 'noop' }) } },
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
  const department = await Department.create({ code: 'ICT', name: 'ICT' });
  const other = await Department.create({ code: 'ENG', name: 'English' });
  const batch = await Batch.create({ departmentId: department._id, code: '22ICT', name: '22 ICT' });
  const year = await AcademicYear.create({ departmentId: department._id, sequence: 1, name: 'Year 1' });
  const laterYear = await AcademicYear.create({ departmentId: department._id, sequence: 2, name: 'Year 2' });
  const semester = await Semester.create({
    departmentId: department._id,
    academicYearId: year._id,
    sequence: 1,
    name: 'Semester 1',
  });
  const laterSemester = await Semester.create({
    departmentId: department._id,
    academicYearId: laterYear._id,
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
  const year2sem2 = await Semester.create({
    departmentId: department._id,
    academicYearId: laterYear._id,
    sequence: 2,
    name: 'Semester 2',
  });
  const unrelated = await SubjectOffering.create({
    departmentId: department._id,
    subjectId: subject._id,
    batchId: batch._id,
    academicYearId: laterYear._id,
    semesterId: year2sem2._id,
  });
  const laterOffering = await SubjectOffering.create({
    departmentId: department._id,
    subjectId: subject._id,
    batchId: batch._id,
    academicYearId: laterYear._id,
    semesterId: laterSemester._id,
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
  const foreignLecturer = await createUser({
    role: ROLES.LECTURER,
    email: 'foreign@example.test',
    departmentId: other._id,
  });
  const regular = await createUser({
    role: ROLES.STUDENT,
    email: 'regular@example.test',
    departmentId: department._id,
  });
  const repeat = await createUser({
    role: ROLES.STUDENT,
    email: 'repeat@example.test',
    departmentId: department._id,
  });
  await LecturerAssignment.create({
    departmentId: department._id,
    lecturerUserId: lecturer._id,
    subjectOfferingId: offering._id,
    assignedByUserId: admin._id,
  });
  await LecturerAssignment.create({
    departmentId: department._id,
    lecturerUserId: lecturer._id,
    subjectOfferingId: laterOffering._id,
    assignedByUserId: admin._id,
  });
  await StudentAcademicContext.create({
    userId: regular._id,
    departmentId: department._id,
    batchId: batch._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
  });
  await StudentAcademicContext.create({
    userId: repeat._id,
    departmentId: department._id,
    batchId: batch._id,
    registrationNumber: 'SEU/IS/22/ICT/002',
    currentAcademicYearId: laterYear._id,
    currentSemesterId: laterSemester._id,
  });
  await SubjectEnrollment.create({
    departmentId: department._id,
    batchId: batch._id,
    studentUserId: repeat._id,
    studentAcademicContextId: (await StudentAcademicContext.findOne({ userId: repeat._id }))._id,
    registrationNumber: 'SEU/IS/22/ICT/002',
    subjectId: subject._id,
    subjectCode: 'ICT1233',
    subjectOfferingId: offering._id,
    enrollmentType: 'REPEAT',
    status: 'ACTIVE',
    createdByUserId: admin._id,
  });
  await SubjectEnrollment.create({
    departmentId: department._id,
    batchId: batch._id,
    studentUserId: regular._id,
    studentAcademicContextId: (await StudentAcademicContext.findOne({ userId: regular._id }))._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    subjectId: subject._id,
    subjectCode: 'ICT1233',
    subjectOfferingId: offering._id,
    enrollmentType: 'ARREAR',
    status: 'ACTIVE',
    createdByUserId: admin._id,
  });
  await SubjectEnrollment.create({
    departmentId: department._id,
    batchId: batch._id,
    studentUserId: repeat._id,
    studentAcademicContextId: (await StudentAcademicContext.findOne({ userId: repeat._id }))._id,
    registrationNumber: 'SEU/IS/22/ICT/002',
    subjectId: subject._id,
    subjectCode: 'ICT1233',
    subjectOfferingId: laterOffering._id,
    enrollmentType: 'ARREAR',
    status: 'CANCELLED',
    cancelledAt: new Date(),
    cancelledByUserId: admin._id,
    createdByUserId: admin._id,
  });
  return { offering, laterOffering, unrelated, lecturer, otherLecturer, foreignLecturer, regular, repeat };
}

test('assigned lecturers see current and active repeat students once, and only on that offering', async () => {
  const world = await seed();
  const lecturer = await login('lecturer@example.test');
  const roster = await lecturer.agent.get(`/api/lecturer/subject-offerings/${world.offering._id}/roster`);
  assert.equal(roster.status, 200);
  assert.equal(roster.body.data.items.length, 2);
  const registrations = roster.body.data.items.map((row) => row.registrationNumber);
  assert.deepEqual(registrations, ['SEU/IS/22/ICT/001', 'SEU/IS/22/ICT/002']);
  const regular = roster.body.data.items.find((row) => row.registrationNumber === 'SEU/IS/22/ICT/001');
  assert.deepEqual(regular.associations.sort(), ['ARREAR', 'CURRENT']);
  const repeat = roster.body.data.items.find((row) => row.registrationNumber === 'SEU/IS/22/ICT/002');
  assert.deepEqual(repeat.associations, ['REPEAT']);

  const later = await lecturer.agent.get(`/api/lecturer/subject-offerings/${world.laterOffering._id}/roster`);
  assert.equal(later.status, 200);
  assert.deepEqual(
    later.body.data.items.map((row) => row.registrationNumber),
    ['SEU/IS/22/ICT/002'],
  );
  assert.deepEqual(later.body.data.items[0].associations, ['CURRENT']);

  const unassigned = await login('other-lecturer@example.test');
  const denied = await unassigned.agent.get(`/api/lecturer/subject-offerings/${world.offering._id}/roster`);
  assert.equal(denied.status, 403);
  const foreign = await login('foreign@example.test');
  const cross = await foreign.agent.get(`/api/lecturer/subject-offerings/${world.offering._id}/roster`);
  assert.equal(cross.status, 403);
});

test('active enrollment grants learning access for that offering only, and cancellation removes it', async () => {
  const world = await seed();
  const repeat = await login('repeat@example.test');
  const allowed = await repeat.agent.get(`/api/learning/offerings/${world.offering._id}`);
  assert.equal(allowed.status, 200);
  const sameSubjectElsewhere = await repeat.agent.get(`/api/learning/offerings/${world.unrelated._id}`);
  assert.equal(sameSubjectElsewhere.status, 404);

  await SubjectEnrollment.updateOne(
    { studentUserId: world.repeat._id, subjectOfferingId: world.offering._id },
    { status: 'CANCELLED', cancelledAt: new Date() },
  );
  const afterCancel = await repeat.agent.get(`/api/learning/offerings/${world.offering._id}`);
  assert.equal(afterCancel.status, 404);
  const roster = await (await login('lecturer@example.test')).agent.get(
    `/api/lecturer/subject-offerings/${world.offering._id}/roster`,
  );
  assert.deepEqual(
    roster.body.data.items.map((row) => row.registrationNumber),
    ['SEU/IS/22/ICT/001'],
  );
  assert.equal(await SubjectEnrollment.countDocuments({ status: 'CANCELLED' }), 2);
});
