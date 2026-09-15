import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
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
import { ROLES } from '../../src/shared/constants/roles.js';
import { OfficialResource } from '../../src/modules/learning-environment/models/official-resource.model.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-04';
process.env.NODE_ENV = 'test';

const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n');

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
    config.storage = { driver: 'local_dev', localPath: path.join(os.tmpdir(), `seu-aims-files-${process.pid}`) };
    app = createApp({
      config,
      logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
      infrastructure: {
        email: { send: async () => ({ accepted: false, provider: 'noop' }) },
        storage: createFileStorage({ config, backendRoot: process.cwd() }),
        malwareScanner: { scan: async () => ({ clean: true, status: 'clean' }) },
        queue: { enqueue: async () => ({ id: 'test-scan' }) },
      },
    });
  } catch (error) {
    process.stderr.write(`Skipping learning integration tests: ${error.message}\n`);
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

async function seedDepartment() {
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
    name: 'Synthetic Subject',
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
    lecturerStatus: 'VERIFIED',
  });
  const otherLecturer = await createUser({
    role: ROLES.LECTURER,
    email: 'other-lecturer@example.test',
    departmentId: department._id,
    lecturerStatus: 'VERIFIED',
  });
  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'student@example.test',
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
    registrationNumber: 'SEU/IS/22/ICT/024',
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
  });
  return { department, offering, admin, lecturer, otherLecturer, student };
}

dbTest('lecturer can upload and publish; student sees only published safe files', async () => {
  const { offering } = await seedDepartment();
  const lecturer = await login('lecturer@example.test');
  const section = await lecturer.agent
    .post(`/api/learning/offerings/${offering._id}/sections`)
    .set('X-CSRF-Token', lecturer.csrfToken)
    .send({ name: 'Lecture Materials' });
  assert.equal(section.status, 201);
  const created = await lecturer.agent
    .post(`/api/learning/offerings/${offering._id}/resources`)
    .set('X-CSRF-Token', lecturer.csrfToken)
    .field('title', 'Week 1 notes')
    .field('sectionId', section.body.data.id)
    .field('category', 'LECTURE')
    .attach('file', pdfBuffer, { filename: 'week1.pdf', contentType: 'application/pdf' });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.publicationState, 'DRAFT');
  assert.equal(created.body.data.scanStatus, 'SAFE');

  const student = await login('student@example.test');
  const hidden = await student.agent.get(`/api/learning/offerings/${offering._id}/resources`);
  assert.equal(hidden.status, 200);
  assert.equal(hidden.body.data.items.length, 0);
  const unpublishedDownload = await student.agent.get(`/api/learning/resources/${created.body.data.id}/download`);
  assert.equal(unpublishedDownload.status, 404);

  const published = await lecturer.agent
    .post(`/api/learning/resources/${created.body.data.id}/publish`)
    .set('X-CSRF-Token', lecturer.csrfToken)
    .send({});
  assert.equal(published.status, 200);
  assert.equal(published.body.data.publicationState, 'PUBLISHED');

  const visible = await student.agent.get(`/api/learning/offerings/${offering._id}/resources`);
  assert.equal(visible.body.data.items.length, 1);
  assert.equal(visible.body.data.items[0].title, 'Week 1 notes');
  const download = await student.agent.get(`/api/learning/resources/${created.body.data.id}/download`);
  assert.equal(download.status, 200);
  assert.match(download.headers['content-disposition'], /attachment/);
});

dbTest('unassigned lecturer cannot manage another offering and students cannot manage resources', async () => {
  const { offering } = await seedDepartment();
  const other = await login('other-lecturer@example.test');
  const denied = await other.agent
    .post(`/api/learning/offerings/${offering._id}/sections`)
    .set('X-CSRF-Token', other.csrfToken)
    .send({ name: 'Hijack' });
  assert.equal(denied.status, 403);
  const student = await login('student@example.test');
  const studentWrite = await student.agent
    .post(`/api/learning/offerings/${offering._id}/sections`)
    .set('X-CSRF-Token', student.csrfToken)
    .send({ name: 'Nope' });
  assert.equal(studentWrite.status, 403);
});

dbTest('executable content is rejected and official resources stay offering-scoped', async () => {
  const { offering } = await seedDepartment();
  const lecturer = await login('lecturer@example.test');
  const section = await lecturer.agent
    .post(`/api/learning/offerings/${offering._id}/sections`)
    .set('X-CSRF-Token', lecturer.csrfToken)
    .send({ name: 'Lecture Materials' });
  const exe = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(32, 1)]);
  const rejected = await lecturer.agent
    .post(`/api/learning/offerings/${offering._id}/resources`)
    .set('X-CSRF-Token', lecturer.csrfToken)
    .field('title', 'malware')
    .field('sectionId', section.body.data.id)
    .attach('file', exe, { filename: 'notes.pdf.exe', contentType: 'application/pdf' });
  assert.equal(rejected.status, 415);
  assert.equal(OfficialResource.schema.paths.subjectOfferingId.options.required, true);
});

dbTest('lecturers still cannot access Study Room', async () => {
  await seedDepartment();
  const lecturer = await login('lecturer@example.test');
  const response = await lecturer.agent.get('/api/study-room/access');
  assert.equal(response.status, 403);
});
