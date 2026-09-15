import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { InMemoryJobQueue } from '../../src/infrastructure/queue/job-queue.js';
import { registerJobProcessors } from '../../src/workers/processors/index.js';
import { processQueuedJobs } from '../../src/workers/dispatch.js';
import { User } from '../../src/modules/authentication/models/user.model.js';
import { hashPassword } from '../../src/modules/authentication/security/passwords.js';
import { Department } from '../../src/modules/academic-foundation/models/department.model.js';
import { AcademicResult } from '../../src/modules/results/models/academic-result.model.js';
import { IncompleteCa } from '../../src/modules/ca-recovery/models/incomplete-ca.model.js';
import { GpaSnapshot } from '../../src/modules/gpa-cgpa/models/gpa-snapshot.model.js';
import { Subject } from '../../src/modules/academic-foundation/models/subject.model.js';
import { StudentAcademicContext } from '../../src/modules/academic-foundation/models/student-academic-context.model.js';
import { Batch } from '../../src/modules/academic-foundation/models/batch.model.js';
import { AcademicYear } from '../../src/modules/academic-foundation/models/academic-year.model.js';
import { Semester } from '../../src/modules/academic-foundation/models/semester.model.js';
import { JOB_NAMES } from '../../src/infrastructure/queue/job-names.js';
import { ROLES } from '../../src/shared/constants/roles.js';
import { Notification } from '../../src/modules/notifications/models/notification.model.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-13';
process.env.NODE_ENV = 'test';

let app;
let queue;
let processors;

before(async () => {
  await startIsolatedMongo();
  const config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  config.auth.loginMaxAttempts = 100;
  queue = new InMemoryJobQueue();
  const logger = createLogger({ service: 'seu-aims-test', level: 'error' });
  const infrastructure = {
    queue,
    email: { send: async () => ({ accepted: false, provider: 'noop' }) },
    whatsapp: { send: async () => ({ accepted: false, provider: 'noop' }) },
    malwareScanner: { scan: async () => ({ clean: true, status: 'clean' }) },
    logger,
  };
  processors = registerJobProcessors({ logger, infrastructure });
  app = createApp({ config, logger, infrastructure });
});

after(async () => {
  await stopIsolatedMongo();
});

beforeEach(async () => {
  await clearIsolatedMongo();
  queue.jobs = [];
  queue.pending = [];
  queue.failed = [];
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

test('smoke: health live and ready are public', async () => {
  const live = await request(app).get('/api/health/live');
  assert.equal(live.status, 200);
  const ready = await request(app).get('/api/health/ready');
  assert.equal(ready.status, 200);
});

test('worker drain reloads official results for ECA and GPA jobs', async () => {
  const department = await Department.create({ code: 'ICT', name: 'ICT' });
  const batch = await Batch.create({ departmentId: department._id, code: '22ICT', name: '22 ICT' });
  const year = await AcademicYear.create({
    departmentId: department._id,
    sequence: 1,
    name: 'Year 1',
  });
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
    includeInGpa: true,
  });
  const student = await User.create({
    role: ROLES.STUDENT,
    email: 'orch-student@example.test',
    displayName: 'Student',
    accountStatus: 'ACTIVE',
    departmentId: department._id,
    passwordHash: await hashPassword('correcthorse', { minLength: 10 }),
    lecturerStatus: 'NOT_APPLICABLE',
  });
  await StudentAcademicContext.create({
    userId: student._id,
    departmentId: department._id,
    batchId: batch._id,
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
  });
  const official = await AcademicResult.create({
    departmentId: department._id,
    studentUserId: student._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    subjectId: subject._id,
    subjectCode: 'ICT1233',
    studentAcademicYearId: year._id,
    studentSemesterId: semester._id,
    resultCode: 'E(CA)',
    previousResultCode: '',
    version: 1,
    isEca: true,
  });

  await queue.enqueue({
    name: JOB_NAMES.ECA_DETECT,
    payload: { studentUserId: String(student._id) },
    jobId: 'eca-1',
  });
  await queue.enqueue({
    name: JOB_NAMES.GPA_RECALCULATE,
    payload: { studentUserId: String(student._id) },
    jobId: 'gpa-1',
  });
  const drained = await processQueuedJobs(queue, processors, { limit: 10 });
  assert.equal(drained.processed, 2);
  assert.equal(queue.pending.length, 0);

  const condition = await IncompleteCa.findOne({ academicResultId: official._id });
  assert.ok(condition);
  assert.equal(condition.status, 'OPEN');
  const snapshot = await GpaSnapshot.findOne({ studentUserId: student._id });
  assert.ok(snapshot);
});

test('admin integrity endpoint is department-scoped and diagnostic', async () => {
  const department = await Department.create({ code: 'ICT', name: 'ICT' });
  await User.create({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'orch-admin@example.test',
    displayName: 'Admin',
    accountStatus: 'ACTIVE',
    departmentId: department._id,
    passwordHash: await hashPassword('correcthorse', { minLength: 10 }),
    lecturerStatus: 'NOT_APPLICABLE',
  });
  const admin = await login('orch-admin@example.test');
  const response = await admin.agent.get('/api/ops/integrity');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.issueCount, 0);
  assert.ok(Array.isArray(response.body.data.issues));
});

test('duplicate ECA detect jobs do not create two incomplete CA rows', async () => {
  const department = await Department.create({ code: 'ICT', name: 'ICT' });
  const year = await AcademicYear.create({
    departmentId: department._id,
    sequence: 1,
    name: 'Year 1',
  });
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
    includeInGpa: true,
  });
  const student = await User.create({
    role: ROLES.STUDENT,
    email: 'dup-student@example.test',
    displayName: 'Student',
    accountStatus: 'ACTIVE',
    departmentId: department._id,
    passwordHash: await hashPassword('correcthorse', { minLength: 10 }),
    lecturerStatus: 'NOT_APPLICABLE',
  });
  const official = await AcademicResult.create({
    departmentId: department._id,
    studentUserId: student._id,
    registrationNumber: 'SEU/IS/22/ICT/002',
    subjectId: subject._id,
    subjectCode: 'ICT1233',
    studentAcademicYearId: year._id,
    studentSemesterId: semester._id,
    resultCode: 'E(CA)',
    previousResultCode: '',
    version: 1,
    isEca: true,
  });
  await queue.enqueue({
    name: JOB_NAMES.ECA_DETECT,
    payload: { studentUserId: String(student._id) },
    jobId: 'eca-dup-1',
  });
  await queue.enqueue({
    name: JOB_NAMES.ECA_DETECT,
    payload: { studentUserId: String(student._id) },
    jobId: 'eca-dup-2',
  });
  await processQueuedJobs(queue, processors, { limit: 10 });
  const count = await IncompleteCa.countDocuments({ academicResultId: official._id });
  assert.equal(count, 1);
  assert.equal(await Notification.countDocuments({ type: 'RESULTS_UPDATED' }), 0);
});
