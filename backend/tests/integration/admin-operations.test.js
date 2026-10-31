import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { InMemoryJobQueue } from '../../src/infrastructure/queue/job-queue.js';
import { seedQaWorld, QA_IDS, QA_PASSWORD } from '../helpers/qa-fixtures.js';
import { hashPassword } from '../../src/modules/authentication/security/passwords.js';
import { User } from '../../src/modules/authentication/models/user.model.js';
import { StudentAcademicContext } from '../../src/modules/academic-foundation/index.js';
import { ResultImport } from '../../src/modules/results/index.js';
import { Notification } from '../../src/modules/notifications/index.js';
import { OfficialResource } from '../../src/modules/learning-environment/index.js';
import { StoredFile } from '../../src/modules/files/index.js';
import { ResourceSection } from '../../src/modules/learning-environment/index.js';
import { ROLES } from '../../src/shared/constants/roles.js';
import { AuditEvent } from '../../src/modules/audit-security/index.js';
import { clearAdminDashboardCache } from '../../src/modules/admin-operations/services/dashboard-cache.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-18';
process.env.NODE_ENV = 'test';

let app;

before(async () => {
  await startIsolatedMongo();
  const config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  app = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
    // Job retry is only supported when the queue can re-enqueue a saved failed job.
    infrastructure: { queue: new InMemoryJobQueue() },
  });
});

after(async () => {
  await stopIsolatedMongo();
});

beforeEach(async () => {
  await clearIsolatedMongo();
  clearAdminDashboardCache();
});

async function login(email) {
  const agent = request.agent(app);
  const csrf = await agent.get('/api/auth/csrf');
  const response = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf.body.data.csrfToken)
    .send({ identifier: email, password: QA_PASSWORD });
  assert.equal(response.status, 200);
  return { agent, csrfToken: response.body.data.csrfToken };
}

test('students and lecturers cannot read admin analytics', async () => {
  await seedQaWorld();
  const student = await login(QA_IDS.STUDENT_A);
  const lecturer = await login(QA_IDS.LECTURER_A);
  assert.equal((await student.agent.get('/api/admin/dashboard')).status, 403);
  assert.equal((await lecturer.agent.get('/api/admin/students')).status, 403);
});

test('admin dashboard counts department data and ignores client departmentId', async () => {
  const world = await seedQaWorld();
  await Notification.create({
    recipientUserId: world.studentA._id,
    type: 'RESULTS_UPDATED',
    sourceModule: 'results',
    sourceId: 'fail',
    channel: 'EMAIL',
    status: 'FAILED',
    category: 'results',
    title: 'Fail',
    body: 'Fail',
    departmentId: world.departmentA._id,
    mandatory: true,
    locale: 'en',
    idempotencyKey: 'qa:fail-mail',
    failureCode: 'PROVIDER',
    failedAt: new Date(),
  });
  const file = await StoredFile.create({
    storageKey: 'qa/resource.pdf',
    originalFilename: 'resource.pdf',
    displayFilename: 'resource.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 10,
    uploadedByUserId: world.adminA._id,
    owningDomain: 'OFFICIAL_RESOURCE',
    owningContextId: world.offeringA._id,
    scanStatus: 'SAFE',
    reviewStatus: 'NOT_REQUIRED',
    availability: 'AVAILABLE',
  });
  const section = await ResourceSection.create({
    departmentId: world.departmentA._id,
    subjectOfferingId: world.offeringA._id,
    name: 'Notes',
  });
  await OfficialResource.create({
    departmentId: world.departmentA._id,
    subjectOfferingId: world.offeringA._id,
    sectionId: section._id,
    createdByUserId: world.adminA._id,
    fileId: file._id,
    title: 'Draft notes',
    category: 'OTHER',
    publicationState: 'DRAFT',
  });

  const admin = await login(QA_IDS.ADMIN_A);
  const started = Date.now();
  const dash = await admin.agent.get(`/api/admin/dashboard?departmentId=${world.departmentB._id}`);
  const elapsedMs = Date.now() - started;
  assert.equal(dash.status, 200);
  assert.equal(dash.body.data.cards.activeStudents, 2);
  assert.equal(dash.body.data.cards.activeLecturers, 2);
  assert.equal(dash.body.data.cards.unresolvedEcaConditions, 1);
  assert.equal(dash.body.data.cards.failedNotifications, 1);
  assert.equal(dash.body.data.cards.unpublishedOfficialResources, 1);
  assert.equal(dash.body.data.ignoredClientDepartmentId, true);
  assert.ok(elapsedMs < 5000, `dashboard ${elapsedMs}ms`);

  const other = await login(QA_IDS.ADMIN_B);
  const otherDash = await other.agent.get('/api/admin/dashboard');
  assert.equal(otherDash.status, 200);
  assert.equal(otherDash.body.data.cards.activeStudents, 1);
  assert.equal(otherDash.body.data.cards.unresolvedEcaConditions, 0);
  assert.equal(otherDash.body.data.cards.unpublishedOfficialResources, 0);
});

test('student search is bounded; other department student is hidden', async () => {
  const world = await seedQaWorld();
  const admin = await login(QA_IDS.ADMIN_A);
  const listed = await admin.agent.get('/api/admin/students?q=SEU/IS/22');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.items.length, 1);
  assert.equal(listed.body.data.items[0].registrationNumber, 'SEU/IS/22/ICT/B01');
  assert.equal(listed.body.data.items[0].unresolvedEcaCount, 1);

  const abuse = await admin.agent.get('/api/admin/students?q=.*');
  assert.equal(abuse.status, 400);

  const otherStudent = await admin.agent.get(`/api/admin/students/${world.studentC._id}`);
  assert.equal(otherStudent.status, 404);

  const detail = await admin.agent.get(`/api/admin/students/${world.studentB._id}`);
  assert.equal(detail.status, 200);
  assert.ok(detail.body.data.results.every((row) => row.subjectCode && row.resultCode));
  assert.equal(detail.body.data.phone, undefined);
});

test('lecturer overview and offering health stay in department', async () => {
  await seedQaWorld();
  const admin = await login(QA_IDS.ADMIN_A);
  const lecturers = await admin.agent.get('/api/admin/lecturers');
  assert.equal(lecturers.status, 200);
  assert.equal(lecturers.body.data.items.length, 2);
  const offerings = await admin.agent.get('/api/admin/offerings');
  assert.equal(offerings.status, 200);
  assert.ok(offerings.body.data.items.length >= 2);
  assert.ok(Object.hasOwn(offerings.body.data.items[0], 'unassigned'));
  assert.ok(Object.hasOwn(offerings.body.data.items[0], 'multipleLecturers'));
});

test('result import monitor and CA overview do not mutate results', async () => {
  const world = await seedQaWorld();
  const file = await StoredFile.create({
    storageKey: 'qa/import.pdf',
    originalFilename: 'import.pdf',
    displayFilename: 'import.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 12,
    uploadedByUserId: world.adminA._id,
    owningDomain: 'RESULT_IMPORT',
    owningContextId: world.departmentA._id,
    scanStatus: 'SAFE',
    reviewStatus: 'NOT_REQUIRED',
    availability: 'AVAILABLE',
  });
  const imported = await ResultImport.create({
    departmentId: world.departmentA._id,
    fileId: file._id,
    uploadedByUserId: world.adminA._id,
    sourceType: 'PDF',
    processingStatus: 'READY_FOR_REVIEW',
    summary: { totalRows: 2, validRows: 2, updateRows: 1, newRows: 1, ecaRows: 1 },
  });

  const admin = await login(QA_IDS.ADMIN_A);
  const list = await admin.agent.get('/api/admin/result-imports');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.items.length, 1);
  assert.equal(list.body.data.items[0].summary.updateRows, 1);

  const monitor = await admin.agent.get(`/api/admin/result-imports/${imported._id}`);
  assert.equal(monitor.status, 200);
  assert.equal(monitor.body.data.processingStatus, 'READY_FOR_REVIEW');

  const mutate = await admin.agent
    .patch(`/api/admin/students/${world.studentB._id}/results`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ resultCode: 'A' });
  assert.equal(mutate.status, 400);

  const force = await admin.agent
    .post('/api/admin/jobs/execute')
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ name: 'anything' });
  assert.equal(force.status, 400);

  const ca = await admin.agent.get('/api/admin/ca-recovery/overview');
  assert.equal(ca.status, 200);
  assert.equal(ca.body.data.incompleteCa.OPEN, 1);
  assert.equal(ca.body.data.applications.DRAFT, 1);
});

test('notification, calendar, jobs, audit, data-quality, and export', async () => {
  const world = await seedQaWorld();
  const admin = await login(QA_IDS.ADMIN_A);

  const notify = await admin.agent.get('/api/admin/notifications/health');
  assert.equal(notify.status, 200);
  assert.ok(Array.isArray(notify.body.data.byStatusAndChannel));

  const calendar = await admin.agent.get('/api/admin/calendar/health');
  assert.equal(calendar.status, 200);
  assert.equal(calendar.body.data.upcomingPublishedEvents, 0);

  const jobs = await admin.agent.get('/api/admin/jobs');
  assert.equal(jobs.status, 200);
  assert.equal(jobs.body.data.retry.supported, true);

  const storage = await admin.agent.get('/api/admin/storage/health');
  assert.equal(storage.status, 200);
  assert.equal(storage.body.data.available, false);

  const audit = await admin.agent.get('/api/admin/audit');
  assert.equal(audit.status, 200);

  const quality = await admin.agent.get('/api/admin/data-quality');
  assert.equal(quality.status, 200);
  assert.ok('issueCount' in quality.body.data);

  const csv = await admin.agent.get('/api/admin/exports/students.csv');
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'], /csv/);
  assert.match(csv.text, /registrationNumber/);
  assert.equal(csv.text.includes('passwordHash'), false);
  assert.match(csv.text, /SEU\/IS\/22\/ICT\/B01/);

  const exportAudit = await AuditEvent.findOne({ action: 'admin.export.students' });
  assert.ok(exportAudit);
  assert.equal(String(exportAudit.departmentId), String(world.departmentA._id));
});

test('admin walkthrough covers dashboard through reports', async () => {
  await seedQaWorld();
  const admin = await login(QA_IDS.ADMIN_A);
  const paths = [
    '/api/admin/dashboard',
    '/api/admin/students',
    '/api/admin/lecturers',
    '/api/admin/offerings',
    '/api/admin/result-imports',
    '/api/admin/ca-recovery/overview',
    '/api/admin/ca-recovery/applications',
    '/api/admin/notifications/health',
    '/api/admin/calendar/health',
    '/api/admin/jobs',
    '/api/admin/security',
    '/api/admin/audit',
    '/api/admin/data-quality',
    '/api/admin/exports/students.csv',
  ];
  for (const path of paths) {
    const response = await admin.agent.get(path);
    assert.equal(response.status, 200, path);
  }
});

test('dashboard latency with extra synthetic students is measured', async () => {
  const world = await seedQaWorld();
  const passwordHash = await hashPassword(QA_PASSWORD, { minLength: 10 });
  const extraUsers = [];
  for (let index = 0; index < 80; index += 1) {
    extraUsers.push({
      role: ROLES.STUDENT,
      email: `perf-${index}@qa.example.test`,
      displayName: `PERF_${String(index).padStart(3, '0')}`,
      accountStatus: 'ACTIVE',
      departmentId: world.departmentA._id,
      passwordHash,
      lecturerStatus: 'NOT_APPLICABLE',
    });
  }
  const inserted = await User.insertMany(extraUsers);
  await StudentAcademicContext.insertMany(
    inserted.map((user, index) => ({
      userId: user._id,
      departmentId: world.departmentA._id,
      batchId: world.batchA._id,
      currentAcademicYearId: world.year2._id,
      currentSemesterId: world.sem2._id,
      registrationNumber: `SEU/IS/22/ICT/P${String(index).padStart(3, '0')}`,
    })),
  );

  const admin = await login(QA_IDS.ADMIN_A);
  const started = Date.now();
  const dash = await admin.agent.get('/api/admin/dashboard');
  const elapsedMs = Date.now() - started;
  assert.equal(dash.status, 200);
  assert.equal(dash.body.data.cards.activeStudents, 82);
  assert.ok(elapsedMs < 8000, `measured dashboard ${elapsedMs}ms on 82 active students`);
});
