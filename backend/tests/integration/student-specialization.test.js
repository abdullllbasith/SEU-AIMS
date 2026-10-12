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
import { CurriculumMapping } from '../../src/modules/academic-foundation/models/curriculum-mapping.model.js';
import { SubjectOffering } from '../../src/modules/academic-foundation/models/subject-offering.model.js';
import { LecturerAssignment } from '../../src/modules/academic-foundation/models/lecturer-assignment.model.js';
import { SubjectEnrollment } from '../../src/modules/academic-foundation/models/subject-enrollment.model.js';
import { StudentAcademicContext } from '../../src/modules/academic-foundation/models/student-academic-context.model.js';
import { StudentAcademicHistory } from '../../src/modules/academic-foundation/models/student-academic-history.model.js';
import { AcademicResult } from '../../src/modules/results/models/academic-result.model.js';
import { ROLES } from '../../src/shared/constants/roles.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-08';
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

async function user(role, email, departmentId) {
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

test('student specialization isolates mixed-batch offerings without assigning existing students', async () => {
  const department = await Department.create({ code: 'ICT', name: 'Department of ICT' });
  const other = await Department.create({ code: 'BST', name: 'Department of BST' });
  const year1 = await AcademicYear.create({ departmentId: department._id, sequence: 1, name: 'Year 1' });
  const year3 = await AcademicYear.create({ departmentId: department._id, sequence: 3, name: 'Year 3' });
  const year4 = await AcademicYear.create({ departmentId: department._id, sequence: 4, name: 'Year 4' });
  const semester1 = await Semester.create({
    departmentId: department._id,
    academicYearId: year3._id,
    sequence: 1,
    name: 'Semester 1',
  });
  const semester2 = await Semester.create({
    departmentId: department._id,
    academicYearId: year3._id,
    sequence: 2,
    name: 'Semester 2',
  });
  const year1Semester = await Semester.create({
    departmentId: department._id,
    academicYearId: year1._id,
    sequence: 1,
    name: 'Semester 1',
  });
  await Semester.create({
    departmentId: department._id,
    academicYearId: year4._id,
    sequence: 1,
    name: 'Semester 1',
  });
  const batch = await Batch.create({
    departmentId: department._id,
    code: '22',
    name: '22 batch',
    status: 'ACTIVE',
    currentAcademicYearId: year3._id,
    currentSemesterId: semester1._id,
    academicContextVerifiedAt: new Date(),
    specialization: 'SWT',
  });
  const subjects = {};
  for (const code of ['COMMON', 'SWTONLY', 'NSTONLY', 'SHARED']) {
    subjects[code] = await Subject.create({
      departmentId: department._id,
      code,
      name: code,
      credits: 2,
      countsForGpa: true,
    });
  }
  const otherSubject = await Subject.create({
    departmentId: other._id,
    code: 'OTHER',
    name: 'Other',
    credits: 2,
    countsForGpa: true,
  });
  await CurriculumMapping.create({
    departmentId: other._id,
    subjectId: otherSubject._id,
    academicYearId: (await AcademicYear.create({ departmentId: other._id, sequence: 3, name: 'Year 3' }))._id,
    semesterId: (
      await Semester.create({
        departmentId: other._id,
        academicYearId: (await AcademicYear.findOne({ departmentId: other._id, sequence: 3 }))._id,
        sequence: 1,
        name: 'Semester 1',
      })
    )._id,
    specialization: 'SWT',
    status: 'ACTIVE',
  });
  async function map(subject, year, semester, specialization) {
    await CurriculumMapping.create({
      departmentId: department._id,
      subjectId: subject._id,
      academicYearId: year._id,
      semesterId: semester._id,
      specialization,
      status: 'ACTIVE',
    });
  }
  await map(subjects.COMMON, year3, semester1, null);
  await map(subjects.SWTONLY, year3, semester1, 'SWT');
  await map(subjects.NSTONLY, year3, semester1, 'NST');
  await map(subjects.SHARED, year3, semester1, 'SWT');
  await map(subjects.SHARED, year3, semester1, 'NST');
  await map(subjects.SWTONLY, year3, semester2, 'SWT');
  await map(subjects.NSTONLY, year3, semester2, 'NST');

  const adminUser = await user(ROLES.DEPARTMENT_ADMINISTRATOR, 'admin@example.test', department._id);
  const lecturerUser = await user(ROLES.LECTURER, 'lecturer@example.test', department._id);
  const softwareUser = await user(ROLES.STUDENT, 'swt@example.test', department._id);
  const networkUser = await user(ROLES.STUDENT, 'nst@example.test', department._id);
  const unsetUser = await user(ROLES.STUDENT, 'unset@example.test', department._id);
  const commonUser = await user(ROLES.STUDENT, 'common@example.test', department._id);
  const admin = await login('admin@example.test');

  async function attach(student, registrationNumber, year, semester) {
    const response = await admin.agent
      .post('/api/academic/students')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        userId: String(student._id),
        registrationNumber,
        batchId: String(batch._id),
        currentAcademicYearId: String(year._id),
        currentSemesterId: String(semester._id),
      });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.data.specialization, null);
    return response.body.data;
  }

  const software = await attach(softwareUser, 'SEU/IS/22/ICT/001', year3, semester1);
  const network = await attach(networkUser, 'SEU/IS/22/ICT/002', year3, semester1);
  const unset = await attach(unsetUser, 'SEU/IS/22/ICT/003', year3, semester1);
  const common = await attach(commonUser, 'SEU/IS/22/ICT/004', year1, year1Semester);
  assert.equal((await StudentAcademicContext.findById(software.id)).specialization, null);

  const rejectedYear = await admin.agent
    .patch(`/api/academic/students/${common.id}`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ specialization: 'SWT' });
  assert.equal(rejectedYear.status, 400);
  const rejectedDepartment = await admin.agent
    .patch(`/api/academic/students/${software.id}`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({
      currentAcademicYearId: String(year4._id),
      currentSemesterId: String((await Semester.findOne({ academicYearId: year4._id }))._id),
      specialization: 'SWT',
    });
  assert.equal(rejectedDepartment.status, 400);
  assert.equal(String((await StudentAcademicContext.findById(software.id)).currentAcademicYearId), String(year3._id));

  const swtSet = await admin.agent
    .patch(`/api/academic/students/${software.id}`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ specialization: 'SWT' });
  const nstSet = await admin.agent
    .patch(`/api/academic/students/${network.id}`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ specialization: 'NST' });
  assert.equal(swtSet.status, 200);
  assert.equal(nstSet.status, 200);
  assert.equal((await StudentAcademicHistory.findOne({ studentAcademicContextId: software.id, semesterId: semester1._id })).specialization, 'SWT');
  const earlier = await StudentAcademicHistory.create({
    studentAcademicContextId: software.id,
    userId: softwareUser._id,
    academicYearId: year3._id,
    semesterId: semester2._id,
    specialization: null,
    recordedAt: new Date('2020-01-01'),
  });

  const result = await AcademicResult.create({
    departmentId: department._id,
    studentUserId: softwareUser._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    subjectId: subjects.COMMON._id,
    subjectCode: 'COMMON',
    studentAcademicYearId: year3._id,
    studentSemesterId: semester1._id,
    resultCode: 'B',
    version: 1,
    isEca: false,
  });

  const generated = await admin.agent
    .post(`/api/academic/batches/${batch._id}/offering-generation`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(generated.status, 200, JSON.stringify(generated.body));
  const codes = generated.body.data.createdSubjects.map((item) => item.subjectCode).sort();
  assert.deepEqual(codes, ['COMMON', 'NSTONLY', 'SHARED', 'SWTONLY']);
  assert.equal(await SubjectOffering.countDocuments({ subjectId: subjects.SHARED._id, batchId: batch._id }), 1);
  assert.equal((await AcademicResult.findById(result._id)).resultCode, 'B');
  assert.equal((await Batch.findById(batch._id)).specialization, 'SWT');

  async function visibleCodes(email) {
    const session = await login(email);
    const response = await session.agent.get('/api/learning/offerings');
    assert.equal(response.status, 200);
    return response.body.data.items.map((item) => item.subjectCode).sort();
  }
  assert.deepEqual(await visibleCodes('swt@example.test'), ['COMMON', 'SHARED', 'SWTONLY']);
  assert.deepEqual(await visibleCodes('nst@example.test'), ['COMMON', 'NSTONLY', 'SHARED']);
  assert.deepEqual(await visibleCodes('unset@example.test'), ['COMMON']);

  const swtSession = await login('swt@example.test');
  const nstOffering = await SubjectOffering.findOne({ subjectId: subjects.NSTONLY._id, semesterId: semester1._id });
  assert.equal((await swtSession.agent.get(`/api/learning/offerings/${nstOffering._id}`)).status, 404);
  const academicOfferings = await swtSession.agent.get('/api/academic/me/offerings');
  assert.deepEqual(academicOfferings.body.data.items.map((item) => item.subjectCode).sort(), ['COMMON', 'SHARED', 'SWTONLY']);

  await SubjectOffering.create({
    departmentId: department._id,
    subjectId: subjects.SWTONLY._id,
    batchId: batch._id,
    academicYearId: year3._id,
    semesterId: semester2._id,
    status: 'ACTIVE',
  });
  await SubjectOffering.create({
    departmentId: department._id,
    subjectId: subjects.NSTONLY._id,
    batchId: batch._id,
    academicYearId: year3._id,
    semesterId: semester2._id,
    status: 'ACTIVE',
  });
  earlier.specialization = 'SWT';
  await earlier.save();
  const history = await swtSession.agent.get('/api/learning/offerings?scope=history');
  const historyCodes = history.body.data.items
    .filter((item) => item.semesterId === String(semester2._id))
    .map((item) => item.subjectCode);
  assert.deepEqual(historyCodes, ['SWTONLY']);

  await LecturerAssignment.create({
    departmentId: department._id,
    lecturerUserId: lecturerUser._id,
    subjectOfferingId: nstOffering._id,
    assignedByUserId: adminUser._id,
  });
  const lecturer = await login('lecturer@example.test');
  const roster = await lecturer.agent.get(`/api/lecturer/subject-offerings/${nstOffering._id}/roster`);
  assert.equal(roster.status, 200);
  assert.deepEqual(roster.body.data.items.map((item) => item.registrationNumber), ['SEU/IS/22/ICT/002']);

  await SubjectEnrollment.create({
    departmentId: department._id,
    batchId: batch._id,
    studentUserId: softwareUser._id,
    studentAcademicContextId: software.id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    subjectId: subjects.NSTONLY._id,
    subjectCode: 'NSTONLY',
    subjectOfferingId: nstOffering._id,
    enrollmentType: 'ARREAR',
    status: 'ACTIVE',
    createdByUserId: adminUser._id,
  });
  const enrolledRoster = await lecturer.agent.get(`/api/lecturer/subject-offerings/${nstOffering._id}/roster`);
  assert.deepEqual(enrolledRoster.body.data.items.map((item) => item.registrationNumber).sort(), [
    'SEU/IS/22/ICT/001',
    'SEU/IS/22/ICT/002',
  ]);
  assert.equal((await swtSession.agent.get(`/api/learning/offerings/${nstOffering._id}`)).status, 200);
  assert.equal((await StudentAcademicContext.findById(unset.id)).specialization, null);
});
