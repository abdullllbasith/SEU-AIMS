import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import ExcelJS from 'exceljs';
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
import { StudentAcademicContext } from '../../src/modules/academic-foundation/models/student-academic-context.model.js';
import { ROLES } from '../../src/shared/constants/roles.js';
import { AcademicResult } from '../../src/modules/results/models/academic-result.model.js';
import { ResultRevision } from '../../src/modules/results/models/result-revision.model.js';
import { IncompleteCa } from '../../src/modules/ca-recovery/models/incomplete-ca.model.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-08';
process.env.NODE_ENV = 'test';

let app;
let config;

before(async () => {
  await startIsolatedMongo();
  config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  config.auth.loginMaxAttempts = 100;
  config.storage = {
    driver: 'local_dev',
    localPath: path.resolve(process.cwd(), '..', '.local-storage', `results-files-${process.pid}`),
  };
  app = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
    infrastructure: {
      email: { send: async () => ({ accepted: false, provider: 'noop' }) },
      storage: createFileStorage({ config, backendRoot: process.cwd() }),
      malwareScanner: { scan: async () => ({ clean: true, status: 'clean' }) },
      queue: { enqueue: async () => ({ id: 'test-job' }) },
    },
  });
});

after(async () => {
  await stopIsolatedMongo();
});

beforeEach(async () => {
  await clearIsolatedMongo();
});

async function createUser({ role, email, departmentId }) {
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

async function xlsxBuffer(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Results');
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function seed() {
  const department = await Department.create({ code: 'ICT', name: 'Department of ICT' });
  const batch22 = await Batch.create({ departmentId: department._id, code: '22', name: '22 batch' });
  const batch23 = await Batch.create({ departmentId: department._id, code: '23', name: '23 batch' });
  const year1 = await AcademicYear.create({ departmentId: department._id, sequence: 1, name: 'Year 1' });
  const year2 = await AcademicYear.create({ departmentId: department._id, sequence: 2, name: 'Year 2' });
  const semester1 = await Semester.create({
    departmentId: department._id,
    academicYearId: year1._id,
    sequence: 1,
    name: 'Semester 1',
  });
  const semester2 = await Semester.create({
    departmentId: department._id,
    academicYearId: year2._id,
    sequence: 1,
    name: 'Semester 1',
  });
  await Subject.create({
    departmentId: department._id,
    code: 'ICT1233',
    name: 'Programming',
    credits: 3,
  });
  await Subject.create({
    departmentId: department._id,
    code: 'ICT1242',
    name: 'Mathematics',
    credits: 2,
  });
  await createUser({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'admin@example.test',
    departmentId: department._id,
  });
  await createUser({
    role: ROLES.LECTURER,
    email: 'lecturer@example.test',
    departmentId: department._id,
  });
  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'student22@example.test',
    departmentId: department._id,
  });
  const other = await createUser({
    role: ROLES.STUDENT,
    email: 'student23@example.test',
    departmentId: department._id,
  });
  const studentContext = await StudentAcademicContext.create({
    userId: student._id,
    departmentId: department._id,
    batchId: batch22._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    currentAcademicYearId: year1._id,
    currentSemesterId: semester1._id,
  });
  await StudentAcademicContext.create({
    userId: other._id,
    departmentId: department._id,
    batchId: batch23._id,
    registrationNumber: 'SEU/IS/23/ICT/001',
    currentAcademicYearId: year1._id,
    currentSemesterId: semester1._id,
  });
  return { student, other, studentContext, year1, year2, semester1, semester2 };
}

test('admin xlsx import matches by registration and subject code, not name', async () => {
  const { student, other } = await seed();
  const admin = await login('admin@example.test');
  const file = await xlsxBuffer([
    ['Registration Number', 'Name', 'Subject Code', 'Result'],
    ['SEU/IS/22/ICT/001', 'Same Name As Other Student', 'ICT1233', 'A'],
  ]);
  const created = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', file, {
      filename: 'results.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.processingStatus, 'READY_FOR_REVIEW');
  const preview = await admin.agent.get(`/api/results/imports/${created.body.data.id}/preview`);
  assert.equal(preview.body.data.items[0].proposedAction, 'NEW');
  assert.equal(preview.body.data.items[0].matchedStudentUserId, String(student._id));
  assert.notEqual(preview.body.data.items[0].matchedStudentUserId, String(other._id));
  const commit = await admin.agent
    .post(`/api/results/imports/${created.body.data.id}/commit`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(commit.status, 200);
  const official = await AcademicResult.findOne({ registrationNumber: 'SEU/IS/22/ICT/001', subjectCode: 'ICT1233' });
  assert.equal(String(official.studentUserId), String(student._id));
  assert.equal(official.resultCode, 'A');
});

test('repeat student later file updates the same official row without moving academic context', async () => {
  const { studentContext, year1, semester1, year2, semester2 } = await seed();
  const admin = await login('admin@example.test');
  const first = await xlsxBuffer([
    ['Registration Number', 'Subject Code', 'Result'],
    ['SEU/IS/22/ICT/001', 'ICT1233', 'E(CA)'],
  ]);
  const import1 = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', first, {
      filename: 'y1.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  const commit1 = await admin.agent
    .post(`/api/results/imports/${import1.body.data.id}/commit`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(commit1.status, 200);
  const incomplete = await IncompleteCa.findOne({ registrationNumber: 'SEU/IS/22/ICT/001', subjectCode: 'ICT1233' });
  assert.equal(incomplete.status, 'OPEN');
  const original = await AcademicResult.findOne({ registrationNumber: 'SEU/IS/22/ICT/001', subjectCode: 'ICT1233' });
  assert.equal(String(original.studentAcademicYearId), String(year1._id));
  assert.equal(String(original.studentSemesterId), String(semester1._id));

  studentContext.currentAcademicYearId = year2._id;
  studentContext.currentSemesterId = semester2._id;
  await studentContext.save();

  const second = await xlsxBuffer([
    ['Registration Number', 'Subject Code', 'Result'],
    ['SEU/IS/23/ICT/001', 'ICT1233', 'B'],
    ['SEU/IS/22/ICT/001', 'ICT1233', 'A'],
  ]);
  const import2 = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', second, {
      filename: 'y2.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  const preview = await admin.agent.get(`/api/results/imports/${import2.body.data.id}/preview`);
  const repeatRow = preview.body.data.items.find((row) => row.registrationNumber === 'SEU/IS/22/ICT/001');
  assert.equal(repeatRow.proposedAction, 'REVIEW');
  assert.match(repeatRow.explanation, /official result remains E\(CA\)/i);
  const commit2 = await admin.agent
    .post(`/api/results/imports/${import2.body.data.id}/commit`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(commit2.status, 200);
  const pending = await AcademicResult.findOne({ registrationNumber: 'SEU/IS/22/ICT/001', subjectCode: 'ICT1233' });
  assert.equal(pending.resultCode, 'E(CA)');
  assert.equal(pending.version, 1);
  const reviews = await admin.agent.get('/api/ca/recovery-results');
  assert.equal(reviews.status, 200);
  const review = reviews.body.data.items.find((item) => item.registrationNumber === 'SEU/IS/22/ICT/001');
  const approved = await admin.agent
    .post(`/api/ca/recovery-results/${review.id}/decision`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ decision: 'APPROVE' });
  assert.equal(approved.status, 200);
  const all = await AcademicResult.find({ subjectCode: 'ICT1233' });
  assert.equal(all.length, 2);
  const updated = all.find((row) => row.registrationNumber === 'SEU/IS/22/ICT/001');
  assert.equal(updated.resultCode, 'A');
  assert.equal(updated.version, 2);
  assert.equal(String(updated._id), String(original._id));
  assert.equal(String(updated.studentAcademicYearId), String(year1._id));
  assert.equal(String(updated.studentSemesterId), String(semester1._id));
  const revisions = await ResultRevision.find({ academicResultId: updated._id });
  assert.equal(revisions.length, 2);
  assert.equal(revisions[revisions.length - 1].previousResultCode, 'E(CA)');
  assert.equal(revisions[revisions.length - 1].newResultCode, 'A');
  const resolved = await IncompleteCa.findById(incomplete._id);
  assert.equal(resolved.status, 'RESOLVED');
  assert.equal(await IncompleteCa.countDocuments({ academicResultId: updated._id }), 1);
  assert.equal(await User.countDocuments({ role: ROLES.STUDENT }), 2);

  const student = await login('student22@example.test');
  const gpa = await student.agent.get('/api/gpa/me');
  assert.equal(gpa.status, 200);
  assert.equal(gpa.body.data.gpa, 4);
  assert.equal(gpa.body.data.credits, 3);
  assert.equal(gpa.body.data.engine, 'DICT-SEUSL-GPA-Calculator');
});

test('unmatched registration or subject is not committed and does not create a student', async () => {
  await seed();
  const admin = await login('admin@example.test');
  const file = await xlsxBuffer([
    ['Registration Number', 'Subject Code', 'Result'],
    ['SEU/IS/22/ICT/999', 'ICT1233', 'A'],
    ['SEU/IS/22/ICT/001', 'ICT9999', 'A'],
  ]);
  const created = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', file, {
      filename: 'unknown.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  assert.equal(created.body.data.processingStatus, 'VALIDATION_ISSUES');
  const preview = await admin.agent.get(`/api/results/imports/${created.body.data.id}/preview`);
  assert.ok(preview.body.data.items.every((row) => row.proposedAction === 'SKIP'));
  assert.ok(preview.body.data.items.every((row) => row.rowStatus === 'BLOCKED'));
  const commit = await admin.agent
    .post(`/api/results/imports/${created.body.data.id}/commit`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(commit.status, 400);
  assert.equal(await AcademicResult.countDocuments(), 0);
  assert.equal(await User.countDocuments({ role: ROLES.STUDENT }), 2);
});

test('commit of the same import is idempotent', async () => {
  await seed();
  const admin = await login('admin@example.test');
  const file = await xlsxBuffer([
    ['Registration Number', 'Subject Code', 'Result'],
    ['SEU/IS/22/ICT/001', 'ICT1233', 'B'],
  ]);
  const created = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', file, {
      filename: 'once.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  const first = await admin.agent
    .post(`/api/results/imports/${created.body.data.id}/commit`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(first.status, 200);
  const second = await admin.agent
    .post(`/api/results/imports/${created.body.data.id}/commit`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(second.status, 200);
  assert.equal(second.body.data.processingStatus, 'COMMITTED');
  assert.equal(await AcademicResult.countDocuments(), 1);
  const official = await AcademicResult.findOne({ registrationNumber: 'SEU/IS/22/ICT/001' });
  assert.equal(official.version, 1);
  assert.equal(await ResultRevision.countDocuments({ importId: created.body.data.id }), 1);
});

test('student sees only own results and GPA from DICT table; lecturer cannot dump results', async () => {
  await seed();
  const admin = await login('admin@example.test');
  const file = await xlsxBuffer([
    ['Registration Number', 'Subject Code', 'Result'],
    ['SEU/IS/22/ICT/001', 'ICT1233', 'A'],
    ['SEU/IS/22/ICT/001', 'ICT1242', 'B'],
    ['SEU/IS/23/ICT/001', 'ICT1233', 'C'],
  ]);
  const created = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', file, {
      filename: 'gpa.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  await admin.agent.post(`/api/results/imports/${created.body.data.id}/commit`).set('X-CSRF-Token', admin.csrfToken).send({});

  const student = await login('student22@example.test');
  const mine = await student.agent.get('/api/results/me');
  assert.equal(mine.status, 200);
  assert.equal(mine.body.data.all.length, 2);
  assert.equal(
    mine.body.data.all.some((row) => row.subjectCode === 'ICT1233' && row.resultCode === 'C'),
    false,
  );
  const idor = await student.agent.get('/api/results/me?studentId=000000000000000000000099');
  assert.equal(idor.status, 403);
  const gpaIdor = await student.agent.get('/api/gpa/me?studentId=000000000000000000000099');
  assert.equal(gpaIdor.status, 403);
  const gpa = await student.agent.get('/api/gpa/me');
  assert.equal(gpa.status, 200);
  assert.equal(gpa.body.data.gpa, 3.6);
  assert.equal(gpa.body.data.engine, 'DICT-SEUSL-GPA-Calculator');

  const other = await login('student23@example.test');
  const otherResults = await other.agent.get('/api/results/me');
  assert.equal(otherResults.body.data.all.length, 1);
  assert.equal(otherResults.body.data.all[0].resultCode, 'C');

  const lecturer = await login('lecturer@example.test');
  const dump = await lecturer.agent.get('/api/results/imports');
  assert.equal(dump.status, 403);
  const lecturerMe = await lecturer.agent.get('/api/results/me');
  assert.equal(lecturerMe.status, 403);
});

test('duplicate checksum of an open import is idempotent; executables are rejected', async () => {
  await seed();
  const admin = await login('admin@example.test');
  const file = await xlsxBuffer([
    ['Registration Number', 'Subject Code', 'Result'],
    ['SEU/IS/22/ICT/001', 'ICT1233', 'A'],
  ]);
  const first = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', file, {
      filename: 'dup.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  const second = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', file, {
      filename: 'dup.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  assert.equal(second.body.data.id, first.body.data.id);
  const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
  const rejected = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', exe, { filename: 'payload.exe', contentType: 'application/octet-stream' });
  assert.equal(rejected.status, 415);
});

test('pdf import commits extracted tokens and empty files fail closed', async () => {
  await seed();
  const admin = await login('admin@example.test');
  const emptyPdf = Buffer.from('%PDF-1.4\nstream\nBT (Department Results) Tj ET\nendstream\n%%EOF\n');
  const failed = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', emptyPdf, { filename: 'empty.pdf', contentType: 'application/pdf' });
  assert.equal(failed.status, 201);
  assert.equal(failed.body.data.processingStatus, 'PARSE_FAILED');
  assert.equal(await AcademicResult.countDocuments(), 0);

  const pdf = Buffer.from(
    '%PDF-1.4\nstream\nBT (SEU/IS/22/ICT/001) Tj (ICT1233) Tj (B+) Tj ET\nendstream\n%%EOF\n',
  );
  const created = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', pdf, { filename: 'results.pdf', contentType: 'application/pdf' });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.sourceType, 'PDF');
  assert.equal(created.body.data.processingStatus, 'READY_FOR_REVIEW');
  const commit = await admin.agent
    .post(`/api/results/imports/${created.body.data.id}/commit`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(commit.status, 200);
  const official = await AcademicResult.findOne({ registrationNumber: 'SEU/IS/22/ICT/001' });
  assert.equal(official.resultCode, 'B+');
});

test('identical later import is unchanged and conflicting duplicates do not commit', async () => {
  await seed();
  const admin = await login('admin@example.test');
  const first = await xlsxBuffer([
    ['Registration Number', 'Subject Code', 'Result'],
    ['SEU/IS/22/ICT/001', 'ICT1233', 'A'],
  ]);
  const created = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', first, {
      filename: 'first.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  const commit = await admin.agent
    .post(`/api/results/imports/${created.body.data.id}/commit`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(commit.status, 200);
  const again = await xlsxBuffer([
    ['Registration Number', 'Subject Code', 'Result'],
    ['seu/is/22/ict/001', 'ict1233', 'A'],
    ['note'],
  ]);
  const second = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', again, {
      filename: 'same-grade.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  assert.equal(second.status, 201);
  const preview = await admin.agent.get(`/api/results/imports/${second.body.data.id}/preview`);
  assert.equal(preview.body.data.items[0].proposedAction, 'UNCHANGED');
  const noop = await admin.agent
    .post(`/api/results/imports/${second.body.data.id}/commit`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(noop.status, 400);
  const official = await AcademicResult.findOne({ registrationNumber: 'SEU/IS/22/ICT/001', subjectCode: 'ICT1233' });
  assert.equal(official.version, 1);

  const conflictFile = await xlsxBuffer([
    ['Registration Number', 'Subject Code', 'Result'],
    ['SEU/IS/22/ICT/001', 'ICT1242', 'B'],
    ['SEU/IS/22/ICT/001', 'ICT1242', 'C'],
  ]);
  const conflict = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', conflictFile, {
      filename: 'conflict.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  const conflictPreview = await admin.agent.get(`/api/results/imports/${conflict.body.data.id}/preview`);
  assert.equal(conflictPreview.body.data.items.length, 2);
  assert.ok(conflictPreview.body.data.items.every((row) => row.rowStatus === 'BLOCKED'));
  assert.ok(conflictPreview.body.data.items.every((row) => row.validationErrors.includes('INTRA_IMPORT_CONFLICT')));
  const blockedCommit = await admin.agent
    .post(`/api/results/imports/${conflict.body.data.id}/commit`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(blockedCommit.status, 400);
  assert.equal(await AcademicResult.countDocuments({ subjectCode: 'ICT1242' }), 0);
});

test('unknown grades are blocked, reject stops commit, and admin search stays scoped', async () => {
  await seed();
  const admin = await login('admin@example.test');
  const student = await login('student22@example.test');
  const unknown = await xlsxBuffer([
    ['Registration Number', 'Subject Code', 'Result'],
    ['SEU/IS/22/ICT/001', 'ICT1233', 'D+'],
  ]);
  const created = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', unknown, {
      filename: 'unknown.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  const preview = await admin.agent.get(`/api/results/imports/${created.body.data.id}/preview`);
  assert.ok(preview.body.data.items[0].validationErrors.includes('UNKNOWN_RESULT_MARKER'));
  assert.equal(preview.body.data.items[0].rowStatus, 'BLOCKED');
  const rejected = await admin.agent
    .post(`/api/results/imports/${created.body.data.id}/reject`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.data.processingStatus, 'CANCELLED');
  const commit = await admin.agent
    .post(`/api/results/imports/${created.body.data.id}/commit`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(commit.status, 400);

  const valid = await xlsxBuffer([
    ['Registration Number', 'Subject Code', 'Result'],
    ['SEU/IS/22/ICT/001', 'ICT1233', 'B'],
  ]);
  const imported = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', valid, {
      filename: 'valid.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  await admin.agent
    .post(`/api/results/imports/${imported.body.data.id}/commit`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  const denied = await student.agent.get('/api/results/analytics');
  assert.equal(denied.status, 403);
  const missing = await admin.agent.get('/api/results/records');
  assert.equal(missing.status, 400);
  const found = await admin.agent.get('/api/results/records').query({ registrationNumber: 'SEU/IS/22/ICT/001' });
  assert.equal(found.status, 200);
  assert.equal(found.body.data.items.length, 1);
  const history = await admin.agent.get(`/api/results/records/${found.body.data.items[0].id}/versions`);
  assert.equal(history.status, 200);
  assert.equal(history.body.data.current.resultCode, 'B');
  assert.ok(history.body.data.versions.length >= 1);
  const counts = await admin.agent.get('/api/results/analytics');
  assert.equal(counts.status, 200);
  assert.equal(counts.body.data.officialResultCount, 1);
  assert.ok(Array.isArray(counts.body.data.subjectAttention));
  assert.equal(JSON.stringify(counts.body.data).includes('student22'), false);
  assert.equal(JSON.stringify(counts.body.data).includes('SEU/IS'), false);
  const report = await admin.agent.get('/api/results/reconciliation');
  assert.equal(report.status, 200);
  assert.equal(typeof report.body.data.issueCount, 'number');
});

test('GPA read does not recalculate, and only an admin can rebuild department snapshots', async () => {
  await seed();
  const admin = await login('admin@example.test');
  const student = await login('student22@example.test');
  const before = await student.agent.get('/api/gpa/me');
  assert.equal(before.body.data.status, 'UNAVAILABLE');
  assert.equal(before.body.data.gpa, null);
  const denied = await student.agent.get('/api/gpa/admin/quality');
  assert.equal(denied.status, 403);
  const file = await xlsxBuffer([
    ['Registration Number', 'Subject Code', 'Result'],
    ['SEU/IS/22/ICT/001', 'ICT1233', 'A'],
  ]);
  const created = await admin.agent
    .post('/api/results/imports')
    .set('X-CSRF-Token', admin.csrfToken)
    .attach('file', file, {
      filename: 'gpa.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  await admin.agent.post(`/api/results/imports/${created.body.data.id}/commit`).set('X-CSRF-Token', admin.csrfToken).send({});
  const after = await student.agent.get('/api/gpa/me');
  assert.equal(after.body.data.gpa, 4);
  assert.equal(after.body.data.calculationVersion, 'DICT-SEUSL-GPA-1');
  const quality = await admin.agent.get('/api/gpa/admin/quality');
  assert.equal(quality.status, 200);
  assert.equal(quality.body.data.current, 1);
  assert.equal(quality.body.data.insights.verifiedSampleSize, 1);
  assert.equal(quality.body.data.insights.ready, false);
  assert.equal(quality.body.data.insights.averageCgpa, null);
  assert.equal(JSON.stringify(quality.body.data).includes('SEU/IS'), false);
  const rebuild = await admin.agent
    .post('/api/gpa/admin/rebuild')
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(rebuild.status, 200);
  assert.equal(rebuild.body.data.failed, 0);
  const again = await student.agent.get('/api/gpa/me');
  assert.equal(again.body.data.gpa, 4);
});
