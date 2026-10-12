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

async function seedAdmin() {
  const department = await Department.create({ code: 'ICT', name: 'Department of ICT' });
  await User.create({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'admin@example.test',
    displayName: 'Admin',
    accountStatus: 'ACTIVE',
    departmentId: department._id,
    passwordHash: await hashPassword('correcthorse', { minLength: 10 }),
    lecturerStatus: 'NOT_APPLICABLE',
  });
  const existing = await Batch.create({
    departmentId: department._id,
    code: '22',
    name: '22 batch',
    status: 'ACTIVE',
  });
  return { department, existing };
}

async function importCatalog(admin) {
  const response = await admin.agent.post('/api/academic/catalog-import').set('X-CSRF-Token', admin.csrfToken).send({});
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}

test('catalog import stores common, SWT, and NST mappings without duplicating a shared subject', async () => {
  const { existing } = await seedAdmin();
  const admin = await login('admin@example.test');
  const imported = await importCatalog(admin);
  assert.equal(imported.offeringsCreated, 0);
  assert.equal(await SubjectOffering.countDocuments(), 0);
  assert.equal((await Batch.findById(existing._id)).specialization || null, null);
  assert.equal(await Subject.countDocuments({ code: 'CMS31022' }), 1);
  assert.equal(await Subject.countDocuments({ code: 'NST32042' }), 1);
  const security = await Subject.findOne({ code: 'NST32042' });
  assert.equal(security.name, 'Information Systems Security');
  assert.equal(security.credits, 2);

  const commonMapping = await CurriculumMapping.findOne({
    subjectId: (await Subject.findOne({ code: 'CIS11012' }))._id,
  });
  assert.equal(commonMapping.specialization, null);

  const software = await Subject.findOne({ code: 'SWT31012' });
  const network = await Subject.findOne({ code: 'NST31011' });
  const shared = await Subject.findOne({ code: 'CMS31022' });
  const softwareMapping = await CurriculumMapping.findOne({ subjectId: software._id });
  const networkMapping = await CurriculumMapping.findOne({ subjectId: network._id });
  const sharedMappings = await CurriculumMapping.find({ subjectId: shared._id });
  assert.equal(softwareMapping.specialization, 'SWT');
  assert.equal(networkMapping.specialization, 'NST');
  assert.deepEqual(sharedMappings.map((item) => item.specialization).sort(), ['NST', 'SWT']);

  const again = await importCatalog(admin);
  assert.equal(again.summary.subjectsCreated, 0);
  assert.equal(again.summary.mappingsCreated, 0);
  assert.equal(await CurriculumMapping.countDocuments({ subjectId: shared._id }), 2);
});

test('an existing unspecialized mapping is not overwritten by a specialized catalog row', async () => {
  const { department } = await seedAdmin();
  const year = await AcademicYear.create({ departmentId: department._id, sequence: 3, name: 'Year 3' });
  const semester = await Semester.create({
    departmentId: department._id,
    academicYearId: year._id,
    sequence: 1,
    name: 'Semester 1',
  });
  const subject = await Subject.create({
    departmentId: department._id,
    code: 'CMS31022',
    name: 'Research Methodologies for ICT',
    credits: 2,
    countsForGpa: true,
  });
  const existing = await CurriculumMapping.create({
    departmentId: department._id,
    subjectId: subject._id,
    academicYearId: year._id,
    semesterId: semester._id,
    specialization: null,
    status: 'ACTIVE',
  });
  const admin = await login('admin@example.test');
  const imported = await importCatalog(admin);
  assert.equal(
    imported.ambiguousMappings.some((item) => item.code === 'CMS31022' && item.reason === 'EXISTING_UNSPECIALIZED_MAPPING'),
    true,
  );
  const stored = await CurriculumMapping.find({ subjectId: subject._id });
  assert.equal(stored.length, 1);
  assert.equal(String(stored[0]._id), String(existing._id));
  assert.equal(stored[0].specialization, null);
});

test('offering generation keeps common subjects and does not use the batch specialization', async () => {
  const { department } = await seedAdmin();
  const admin = await login('admin@example.test');
  await importCatalog(admin);
  const year1 = await AcademicYear.findOne({ sequence: 1 });
  const semester1 = await Semester.findOne({ academicYearId: year1._id, sequence: 1 });
  const year3 = await AcademicYear.findOne({ sequence: 3 });
  const year3Semester = await Semester.findOne({ academicYearId: year3._id, sequence: 1 });

  async function batchAt(code, year, semester, specialization) {
    return Batch.create({
      departmentId: department._id,
      code,
      name: code,
      status: 'ACTIVE',
      currentAcademicYearId: year._id,
      currentSemesterId: semester._id,
      academicContextVerifiedAt: new Date(),
      specialization,
    });
  }

  const commonBatch = await batchAt('Y1', year1, semester1, null);
  const softwareBatch = await batchAt('SWT', year3, year3Semester, 'SWT');
  const unsetBatch = await batchAt('UNSET', year3, year3Semester, null);

  async function generate(batch) {
    const response = await admin.agent
      .post(`/api/academic/batches/${batch._id}/offering-generation`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({});
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body.data;
  }

  const commonGenerated = await generate(commonBatch);
  const commonCodes = commonGenerated.createdSubjects.map((item) => item.subjectCode);
  assert.equal(commonCodes.includes('CIS11012'), true);
  assert.equal(commonCodes.includes('SWT31012'), false);
  assert.equal(commonGenerated.skippedSubjects.some((item) => item.reason === 'SPECIALIZATION_UNSET'), false);

  const softwareGenerated = await generate(softwareBatch);
  assert.equal(softwareGenerated.created, 0);
  assert.equal(
    softwareGenerated.skippedSubjects.every((item) => item.reason === 'NO_STUDENT_WITH_SPECIALIZATION'),
    true,
  );
  assert.equal(await SubjectOffering.countDocuments({ batchId: softwareBatch._id }), 0);

  const unsetGenerated = await generate(unsetBatch);
  assert.equal(unsetGenerated.created, 0);
  assert.equal(
    unsetGenerated.skippedSubjects.every((item) => item.reason === 'NO_STUDENT_WITH_SPECIALIZATION'),
    true,
  );
});
