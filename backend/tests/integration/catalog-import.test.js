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
import { StudentAcademicContext } from '../../src/modules/academic-foundation/models/student-academic-context.model.js';
import { AcademicResult } from '../../src/modules/results/models/academic-result.model.js';
import { ROLES } from '../../src/shared/constants/roles.js';
import { buildCatalogPlan } from '../../src/modules/academic-foundation/services/catalog-plan.js';
import { DICT_SEUSL_CATALOG } from '../../src/modules/academic-foundation/data/dict-seusl-catalog.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-08';
process.env.NODE_ENV = 'test';

let app;
const plan = buildCatalogPlan(DICT_SEUSL_CATALOG);

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

async function seed() {
  const department = await Department.create({ code: 'ICT', name: 'Department of ICT' });
  const batch = await Batch.create({ departmentId: department._id, code: '22', name: '22 batch' });
  const year = await AcademicYear.create({ departmentId: department._id, sequence: 1, name: 'Year 1', status: 'ARCHIVED' });
  const semester = await Semester.create({
    departmentId: department._id,
    academicYearId: year._id,
    sequence: 1,
    name: 'Semester 1',
    status: 'ARCHIVED',
  });
  const conflict = await Subject.create({
    departmentId: department._id,
    code: 'SWT11012',
    name: 'Fundamentals of Programming',
    credits: 9,
    countsForGpa: true,
  });
  const offering = await SubjectOffering.create({
    departmentId: department._id,
    subjectId: conflict._id,
    batchId: batch._id,
    academicYearId: year._id,
    semesterId: semester._id,
  });
  const admin = await User.create({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'admin@example.test',
    displayName: 'Admin',
    accountStatus: 'ACTIVE',
    departmentId: department._id,
    passwordHash: await hashPassword('correcthorse', { minLength: 10 }),
    lecturerStatus: 'NOT_APPLICABLE',
  });
  const student = await User.create({
    role: ROLES.STUDENT,
    email: 'student@example.test',
    displayName: 'Student',
    accountStatus: 'ACTIVE',
    departmentId: department._id,
    passwordHash: await hashPassword('correcthorse', { minLength: 10 }),
    lecturerStatus: 'NOT_APPLICABLE',
  });
  const context = await StudentAcademicContext.create({
    userId: student._id,
    departmentId: department._id,
    batchId: batch._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
  });
  const result = await AcademicResult.create({
    departmentId: department._id,
    studentUserId: student._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    subjectId: conflict._id,
    subjectCode: 'SWT11012',
    studentAcademicYearId: year._id,
    studentSemesterId: semester._id,
    resultCode: 'B',
    version: 1,
    isEca: false,
  });
  return { department, batch, year, semester, conflict, offering, admin, context, result };
}

test('catalog preview reports conflicts and does not insert rows', async () => {
  const seeded = await seed();
  const admin = await login('admin@example.test');
  const preview = await admin.agent.get('/api/academic/catalog-import');
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data.conflicts.some((item) => item.code === 'NST32042'), false);
  assert.equal(preview.body.data.databaseConflicts[0].code, 'SWT11012');
  assert.equal(preview.body.data.mappings.blocked > 0, true);
  assert.equal(preview.body.data.offeringsCreated, 0);
  assert.equal(await Subject.countDocuments(), 1);
  assert.equal(await CurriculumMapping.countDocuments(), 0);
  assert.equal(await SubjectOffering.countDocuments({ _id: seeded.offering._id }), 1);
});

test('catalog import is idempotent and leaves results, context, and offerings unchanged', async () => {
  const seeded = await seed();
  const admin = await login('admin@example.test');
  const first = await admin.agent.post('/api/academic/catalog-import').set('X-CSRF-Token', admin.csrfToken).send({});
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.data.summary.subjectsCreated, plan.subjects.length - 1);
  assert.equal(
    first.body.data.summary.mappingsCreated,
    plan.mappings.filter((item) => item.year !== 1).length,
  );
  assert.equal(first.body.data.summary.offeringsCreated, 0);
  assert.equal(first.body.data.conflicts.some((item) => item.code === 'NST32042'), false);
  const programming = await Subject.findOne({ code: 'SWT11012' });
  assert.equal(programming.credits, 9);
  const security = await Subject.findOne({ code: 'NST32042' });
  assert.equal(await Subject.countDocuments({ code: 'NST32042' }), 1);
  assert.equal(security.name, 'Information Systems Security');
  assert.equal(security.credits, 2);
  const securityYear = await AcademicYear.findOne({ sequence: 3, status: 'ACTIVE' });
  const securitySemester = await Semester.findOne({ academicYearId: securityYear._id, sequence: 2, status: 'ACTIVE' });
  const securityMappings = await CurriculumMapping.find({ subjectId: security._id, academicYearId: securityYear._id, semesterId: securitySemester._id });
  assert.deepEqual(securityMappings.map((item) => item.specialization).sort(), ['NST', 'SWT']);
  const english = await Subject.findOne({ code: 'CMS11022' });
  assert.equal(english.credits, 2);
  assert.equal(english.countsForGpa, false);
  const year1Mappings = await CurriculumMapping.countDocuments({ academicYearId: seeded.year._id });
  assert.equal(year1Mappings, 0);
  const database = await Subject.findOne({ code: 'SWT21012' });
  assert.equal(database.credits, 2);
  const activeYear2 = await AcademicYear.findOne({ sequence: 2, status: 'ACTIVE' });
  const semester = await Semester.findOne({ academicYearId: activeYear2._id, sequence: 1, status: 'ACTIVE' });
  const mapping = await CurriculumMapping.findOne({ subjectId: database._id, academicYearId: activeYear2._id, semesterId: semester._id });
  assert.ok(mapping);
  const year1Subject = await Subject.findOne({ code: 'CIS11012' });
  assert.equal(await CurriculumMapping.countDocuments({ subjectId: year1Subject._id }), 0);

  const second = await admin.agent.post('/api/academic/catalog-import').set('X-CSRF-Token', admin.csrfToken).send({});
  assert.equal(second.status, 200);
  assert.equal(second.body.data.summary.subjectsCreated, 0);
  assert.equal(second.body.data.summary.mappingsCreated, 0);
  assert.equal(second.body.data.summary.yearsCreated, 0);
  assert.equal(await Subject.countDocuments(), first.body.data.summary.subjectsCreated + 1);
  assert.equal(await CurriculumMapping.countDocuments(), first.body.data.summary.mappingsCreated);
  assert.equal(await SubjectOffering.countDocuments(), 1);
  const context = await StudentAcademicContext.findById(seeded.context._id);
  assert.equal(String(context.currentAcademicYearId), String(seeded.year._id));
  assert.equal(String(context.batchId), String(seeded.batch._id));
  const result = await AcademicResult.findById(seeded.result._id);
  assert.equal(result.resultCode, 'B');
  assert.equal(result.version, 1);
});
