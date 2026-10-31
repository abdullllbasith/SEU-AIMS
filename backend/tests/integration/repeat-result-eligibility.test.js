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
import { SubjectOffering } from '../../src/modules/academic-foundation/models/subject-offering.model.js';
import { LecturerAssignment } from '../../src/modules/academic-foundation/models/lecturer-assignment.model.js';
import { StudentAcademicContext } from '../../src/modules/academic-foundation/models/student-academic-context.model.js';
import { SubjectEnrollment } from '../../src/modules/academic-foundation/models/subject-enrollment.model.js';
import { ROLES } from '../../src/shared/constants/roles.js';
import { AcademicResult } from '../../src/modules/results/models/academic-result.model.js';
import { ResultRevision } from '../../src/modules/results/models/result-revision.model.js';
import { CaRecoveryResultReview } from '../../src/modules/ca-recovery/models/ca-recovery-result-review.model.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-08';
process.env.NODE_ENV = 'test';

let app;

before(async () => {
  await startIsolatedMongo();
  const config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  config.auth.loginMaxAttempts = 100;
  config.storage = {
    driver: 'local_dev',
    localPath: path.resolve(process.cwd(), '..', '.local-storage', `repeat-results-${process.pid}`),
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
  await CaRecoveryResultReview.init();
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
  const otherDepartment = await Department.create({ code: 'BST', name: 'Department of BST' });
  const batch = await Batch.create({ departmentId: department._id, code: '22', name: '22 batch' });
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
    academicYearId: year2._id,
    semesterId: semester2._id,
  });
  const admin = await createUser({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'admin@example.test',
    departmentId: department._id,
  });
  const otherAdmin = await createUser({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'other-admin@example.test',
    departmentId: otherDepartment._id,
  });
  const lecturer = await createUser({
    role: ROLES.LECTURER,
    email: 'lecturer@example.test',
    departmentId: department._id,
  });
  const outsider = await createUser({
    role: ROLES.LECTURER,
    email: 'outsider@example.test',
    departmentId: department._id,
  });
  await LecturerAssignment.create({
    departmentId: department._id,
    lecturerUserId: lecturer._id,
    subjectOfferingId: offering._id,
    assignedByUserId: admin._id,
  });
  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'student22@example.test',
    departmentId: department._id,
  });
  const context = await StudentAcademicContext.create({
    userId: student._id,
    departmentId: department._id,
    batchId: batch._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    currentAcademicYearId: year1._id,
    currentSemesterId: semester1._id,
  });
  return { department, subject, offering, admin, otherAdmin, lecturer, outsider, student, context, year1, semester1, year2, semester2 };
}

async function importResult(admin, resultCode, filename) {
  const file = await xlsxBuffer([
    ['Registration Number', 'Subject Code', 'Result'],
    ['SEU/IS/22/ICT/001', 'ICT1233', resultCode],
  ]);
  const created = await admin.agent.post('/api/results/imports').set('X-CSRF-Token', admin.csrfToken).attach('file', file, {
    filename,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const preview = await admin.agent.get(`/api/results/imports/${created.body.data.id}/preview`);
  return { created, preview, row: preview.body.data.items[0] };
}

async function commitImport(admin, importId) {
  return admin.agent.post(`/api/results/imports/${importId}/commit`).set('X-CSRF-Token', admin.csrfToken).send({});
}

test('E(ESA) and E(CA&ESA) repeat grades cap at C Pass and keep the original period', async () => {
  const { year1, semester1, year2, semester2, context } = await seed();
  const admin = await login('admin@example.test');
  for (const marker of ['E(ESA)', 'E(CA&ESA)']) {
    await AcademicResult.deleteMany({});
    await ResultRevision.deleteMany({});
    const first = await importResult(admin, marker, `${marker}-first.xlsx`);
    assert.equal(first.row.proposedAction, 'NEW');
    assert.equal((await commitImport(admin, first.created.body.data.id)).status, 200);
    // A result belongs to the subject's own offering period (result-period.js), not the student's current one.
    const original = await AcademicResult.findOne({ subjectCode: 'ICT1233' });
    assert.equal(String(original.studentAcademicYearId), String(year2._id));
    assert.equal(String(original.studentSemesterId), String(semester2._id));
    context.currentAcademicYearId = year1._id;
    context.currentSemesterId = semester1._id;
    await context.save();
    const repeat = await importResult(admin, 'A+', `${marker}-repeat.xlsx`);
    assert.equal(repeat.row.proposedAction, 'UPDATE');
    assert.equal(repeat.row.gradeCapApplied, true);
    assert.equal(repeat.row.rawResultCode, 'A+');
    assert.equal(repeat.row.officialResultCode, 'C');
    assert.match(repeat.row.explanation, /C Pass/);
    assert.equal((await commitImport(admin, repeat.created.body.data.id)).status, 200);
    const official = await AcademicResult.findOne({ subjectCode: 'ICT1233' });
    assert.equal(official.resultCode, 'C');
    assert.equal(official.rawResultCode, 'A+');
    assert.equal(official.gradeCapApplied, true);
    assert.equal(official.gradeCapReason, marker);
    // The repeat grade keeps the original period; it does not follow the student's current year and semester.
    assert.equal(String(official.studentAcademicYearId), String(original.studentAcademicYearId));
    assert.equal(String(official.studentSemesterId), String(original.studentSemesterId));
    assert.equal(String(official.studentAcademicYearId), String(year2._id));
    assert.equal(String(official.studentSemesterId), String(semester2._id));
    const revision = await ResultRevision.findOne({ academicResultId: official._id, newResultCode: 'C' });
    assert.equal(revision.previousResultCode, marker);
    assert.equal(revision.rawResultCode, 'A+');
    assert.equal(revision.gradeCapApplied, true);
    const student = await login('student22@example.test');
    const gpa = await student.agent.get('/api/gpa/me');
    assert.equal(gpa.body.data.gpa, 2);
  }
  assert.equal(await SubjectEnrollment.countDocuments(), 0);
});

test('a grade at or below C Pass is recorded without a cap', async () => {
  await seed();
  const admin = await login('admin@example.test');
  const first = await importResult(admin, 'E(ESA)', 'esa.xlsx');
  await commitImport(admin, first.created.body.data.id);
  const repeat = await importResult(admin, 'C-', 'low.xlsx');
  assert.equal(repeat.row.gradeCapApplied, false);
  assert.equal(repeat.row.officialResultCode, 'C-');
  await commitImport(admin, repeat.created.body.data.id);
  const official = await AcademicResult.findOne({ subjectCode: 'ICT1233' });
  assert.equal(official.resultCode, 'C-');
  assert.equal(official.gradeCapApplied, false);
});

test('ordinary result changes stay uncapped', async () => {
  await seed();
  const admin = await login('admin@example.test');
  const first = await importResult(admin, 'B', 'b.xlsx');
  await commitImport(admin, first.created.body.data.id);
  const next = await importResult(admin, 'A+', 'aplus.xlsx');
  assert.equal(next.row.proposedAction, 'UPDATE');
  assert.equal(next.row.gradeCapApplied, false);
  assert.equal(next.row.officialResultCode, 'A+');
  await commitImport(admin, next.created.body.data.id);
  const official = await AcademicResult.findOne({ subjectCode: 'ICT1233' });
  assert.equal(official.resultCode, 'A+');
  const student = await login('student22@example.test');
  const gpa = await student.agent.get('/api/gpa/me');
  assert.equal(gpa.body.data.gpa, 4);
});

test('E(ESA) cannot be replaced by another incomplete marker', async () => {
  await seed();
  const admin = await login('admin@example.test');
  const first = await importResult(admin, 'E(ESA)', 'esa.xlsx');
  await commitImport(admin, first.created.body.data.id);
  const ambiguous = await importResult(admin, 'E(CA)', 'eca.xlsx');
  assert.equal(ambiguous.row.rowStatus, 'BLOCKED');
  assert.equal(ambiguous.row.proposedAction, 'SKIP');
  assert.ok(ambiguous.row.validationErrors.includes('AMBIGUOUS_REPEAT_RESULT'));
  const commit = await commitImport(admin, ambiguous.created.body.data.id);
  assert.equal(commit.status, 400);
  const official = await AcademicResult.findOne({ subjectCode: 'ICT1233' });
  assert.equal(official.resultCode, 'E(ESA)');
});

test('E(CA) recovery stays pending until an authorized reviewer approves the uncapped grade', async () => {
  const { year2, semester2 } = await seed();
  const admin = await login('admin@example.test');
  const studentLogin = await login('student22@example.test');
  const outsider = await login('outsider@example.test');
  const otherAdmin = await login('other-admin@example.test');
  const lecturer = await login('lecturer@example.test');
  const first = await importResult(admin, 'E(CA)', 'eca.xlsx');
  await commitImport(admin, first.created.body.data.id);
  const recovery = await importResult(admin, 'A+', 'recovery.xlsx');
  assert.equal(recovery.row.proposedAction, 'REVIEW');
  assert.equal(recovery.row.gradeCapApplied, false);
  assert.match(recovery.row.explanation, /pending review/);
  assert.equal((await commitImport(admin, recovery.created.body.data.id)).status, 200);
  const held = await AcademicResult.findOne({ subjectCode: 'ICT1233' });
  assert.equal(held.resultCode, 'E(CA)');
  // The held E(CA) result stays in the subject's offering period while the recovery grade is pending review.
  assert.equal(String(held.studentAcademicYearId), String(year2._id));
  assert.equal(String(held.studentSemesterId), String(semester2._id));
  const reviews = await admin.agent.get('/api/ca/recovery-results');
  const reviewId = reviews.body.data.items[0].id;
  assert.equal(
    (await studentLogin.agent.post(`/api/ca/recovery-results/${reviewId}/decision`).set('X-CSRF-Token', studentLogin.csrfToken).send({ decision: 'APPROVE' })).status,
    403,
  );
  assert.equal(
    (await outsider.agent.post(`/api/ca/recovery-results/${reviewId}/decision`).set('X-CSRF-Token', outsider.csrfToken).send({ decision: 'APPROVE' })).status,
    403,
  );
  assert.equal(
    (await otherAdmin.agent.post(`/api/ca/recovery-results/${reviewId}/decision`).set('X-CSRF-Token', otherAdmin.csrfToken).send({ decision: 'APPROVE' })).status,
    403,
  );
  const duplicate = await importResult(admin, 'B+', 'other-recovery.xlsx');
  assert.equal(duplicate.row.rowStatus, 'BLOCKED');
  assert.ok(duplicate.row.validationErrors.includes('DUPLICATE_CA_RECOVERY_PENDING'));
  const same = await importResult(admin, 'A+', 'same-recovery.xlsx');
  assert.equal(same.row.proposedAction, 'UNCHANGED');
  const approved = await lecturer.agent
    .post(`/api/ca/recovery-results/${reviewId}/decision`)
    .set('X-CSRF-Token', lecturer.csrfToken)
    .send({ decision: 'APPROVE' });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.decision, 'APPROVE');
  assert.ok(approved.body.data.reviewerUserId);
  assert.ok(approved.body.data.decidedAt);
  const again = await admin.agent
    .post(`/api/ca/recovery-results/${reviewId}/decision`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ decision: 'APPROVE' });
  assert.equal(again.status, 409);
  const official = await AcademicResult.findOne({ subjectCode: 'ICT1233' });
  assert.equal(official.resultCode, 'A+');
  assert.equal(official.gradeCapApplied, false);
  assert.equal(official.version, 2);
  const revision = await ResultRevision.findOne({ academicResultId: official._id, newResultCode: 'A+' });
  assert.equal(revision.previousResultCode, 'E(CA)');
  assert.equal(revision.gradeCapApplied, false);
  const student = await login('student22@example.test');
  const gpa = await student.agent.get('/api/gpa/me');
  assert.equal(gpa.body.data.gpa, 4);
  assert.equal(await SubjectEnrollment.countDocuments(), 0);
});

test('rejected CA recovery keeps E(CA) and a later submission can be approved', async () => {
  await seed();
  const admin = await login('admin@example.test');
  const first = await importResult(admin, 'E(CA)', 'eca.xlsx');
  await commitImport(admin, first.created.body.data.id);
  const recovery = await importResult(admin, 'A', 'a.xlsx');
  await commitImport(admin, recovery.created.body.data.id);
  const reviewId = (await admin.agent.get('/api/ca/recovery-results')).body.data.items[0].id;
  const rejected = await admin.agent
    .post(`/api/ca/recovery-results/${reviewId}/decision`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ decision: 'REJECT' });
  assert.equal(rejected.status, 200);
  assert.equal((await AcademicResult.findOne({ subjectCode: 'ICT1233' })).resultCode, 'E(CA)');
  const next = await importResult(admin, 'B', 'b.xlsx');
  assert.equal(next.row.proposedAction, 'REVIEW');
  await commitImport(admin, next.created.body.data.id);
  const nextId = (await admin.agent.get('/api/ca/recovery-results')).body.data.items[0].id;
  assert.notEqual(nextId, reviewId);
  const approved = await admin.agent
    .post(`/api/ca/recovery-results/${nextId}/decision`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ decision: 'APPROVE' });
  assert.equal(approved.status, 200);
  assert.equal((await AcademicResult.findOne({ subjectCode: 'ICT1233' })).resultCode, 'B');
});

test('concurrent approval decides the pending review once', async () => {
  await seed();
  const admin = await login('admin@example.test');
  const first = await importResult(admin, 'E(CA)', 'eca.xlsx');
  await commitImport(admin, first.created.body.data.id);
  const recovery = await importResult(admin, 'A', 'a.xlsx');
  await commitImport(admin, recovery.created.body.data.id);
  const reviewId = (await admin.agent.get('/api/ca/recovery-results')).body.data.items[0].id;
  const [left, right] = await Promise.all([
    admin.agent.post(`/api/ca/recovery-results/${reviewId}/decision`).set('X-CSRF-Token', admin.csrfToken).send({ decision: 'APPROVE' }),
    admin.agent.post(`/api/ca/recovery-results/${reviewId}/decision`).set('X-CSRF-Token', admin.csrfToken).send({ decision: 'APPROVE' }),
  ]);
  const statuses = [left.status, right.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  assert.equal(await CaRecoveryResultReview.countDocuments({ status: 'APPROVED' }), 1);
  assert.equal((await AcademicResult.findOne({ subjectCode: 'ICT1233' })).resultCode, 'A');
  assert.equal(await ResultRevision.countDocuments({ newResultCode: 'A' }), 1);
});
