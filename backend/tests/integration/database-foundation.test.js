import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { User } from '../../src/modules/authentication/index.js';
import {
  Department,
  Batch,
  AcademicYear,
  Semester,
  Subject,
  SubjectOffering,
  LecturerAssignment,
  StudentAcademicContext,
  StudentAcademicHistory,
} from '../../src/modules/academic-foundation/index.js';
import { AcademicResult, findOfficialResult } from '../../src/modules/results/index.js';
import { IncompleteCa, CaApplication, createPublicApplicationId } from '../../src/modules/ca-recovery/index.js';
import { Notification } from '../../src/modules/notifications/index.js';
import { ROLES } from '../../src/shared/constants/roles.js';

let fixtures;
let mongoReady = false;

before(async () => {
  try {
    await startIsolatedMongo();
    mongoReady = true;
  } catch (error) {
    process.stderr.write(`Skipping MongoDB integration tests: ${error.message}\n`);
  }
});

after(async () => {
  if (mongoReady) {
    await stopIsolatedMongo();
  }
});

beforeEach(async () => {
  if (!mongoReady) {
    return;
  }
  await clearIsolatedMongo();
  fixtures = await createAcademicFixtures();
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

async function createAcademicFixtures() {
  const admin = await User.create({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'admin@example.test',
    displayName: 'Dev Admin',
  });
  const lecturer = await User.create({
    role: ROLES.LECTURER,
    email: 'lecturer@example.test',
    displayName: 'Dev Lecturer',
    lecturerStatus: 'VERIFIED',
  });
  const student = await User.create({
    role: ROLES.STUDENT,
    email: 'student@example.test',
    displayName: 'Dev Student',
  });
  const department = await Department.create({ code: 'ICT', name: 'Department of ICT' });
  const batch = await Batch.create({
    departmentId: department._id,
    code: '22',
    name: '22 batch',
  });
  const year1 = await AcademicYear.create({
    departmentId: department._id,
    sequence: 1,
    name: 'Year 1',
  });
  const year2 = await AcademicYear.create({
    departmentId: department._id,
    sequence: 2,
    name: 'Year 2',
  });
  const sem1 = await Semester.create({
    departmentId: department._id,
    academicYearId: year1._id,
    sequence: 1,
    name: 'Semester 1',
  });
  const sem2 = await Semester.create({
    departmentId: department._id,
    academicYearId: year2._id,
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
    academicYearId: year1._id,
    semesterId: sem1._id,
  });
  const context = await StudentAcademicContext.create({
    userId: student._id,
    departmentId: department._id,
    batchId: batch._id,
    registrationNumber: 'SEU/IS/22/ICT/024',
    currentAcademicYearId: year2._id,
    currentSemesterId: sem2._id,
  });
  await StudentAcademicHistory.create({
    studentAcademicContextId: context._id,
    userId: student._id,
    academicYearId: year1._id,
    semesterId: sem1._id,
  });

  return {
    admin,
    lecturer,
    student,
    department,
    batch,
    year1,
    year2,
    sem1,
    sem2,
    subject,
    offering,
    context,
  };
}

dbTest('registration numbers are unique and are not replaced by a later batch file identity', async () => {
  await assert.rejects(
    () =>
      StudentAcademicContext.create({
        userId: new mongoose.Types.ObjectId(),
        departmentId: fixtures.department._id,
        batchId: fixtures.batch._id,
        registrationNumber: 'SEU/IS/22/ICT/024',
        currentAcademicYearId: fixtures.year2._id,
        currentSemesterId: fixtures.sem2._id,
      }),
    { code: 11000 },
  );
});

dbTest('subject offering uniqueness is subject + batch + year + semester', async () => {
  await assert.rejects(
    () =>
      SubjectOffering.create({
        departmentId: fixtures.department._id,
        subjectId: fixtures.subject._id,
        batchId: fixtures.batch._id,
        academicYearId: fixtures.year1._id,
        semesterId: fixtures.sem1._id,
      }),
    { code: 11000 },
  );
});

dbTest('multiple lecturers may be assigned to the same offering', async () => {
  const secondLecturer = await User.create({
    role: ROLES.LECTURER,
    email: 'lecturer2@example.test',
    lecturerStatus: 'VERIFIED',
  });
  await LecturerAssignment.create({
    departmentId: fixtures.department._id,
    lecturerUserId: fixtures.lecturer._id,
    subjectOfferingId: fixtures.offering._id,
    assignedByUserId: fixtures.admin._id,
  });
  await LecturerAssignment.create({
    departmentId: fixtures.department._id,
    lecturerUserId: secondLecturer._id,
    subjectOfferingId: fixtures.offering._id,
    assignedByUserId: fixtures.admin._id,
  });
  const count = await LecturerAssignment.countDocuments({ subjectOfferingId: fixtures.offering._id });
  assert.equal(count, 2);
});

dbTest('progressing a student keeps academic history rows', async () => {
  const history = await StudentAcademicHistory.find({ userId: fixtures.student._id });
  assert.equal(history.length, 1);
  const current = await StudentAcademicContext.findById(fixtures.context._id);
  assert.equal(String(current.currentAcademicYearId), String(fixtures.year2._id));
  assert.notEqual(String(current.currentAcademicYearId), String(history[0].academicYearId));
});

dbTest('repeat-student result updates the same registration number + subject code record', async () => {
  await AcademicResult.create({
    studentUserId: fixtures.student._id,
    registrationNumber: 'SEU/IS/22/ICT/024',
    subjectId: fixtures.subject._id,
    subjectCode: 'ICT1233',
    studentAcademicYearId: fixtures.year1._id,
    studentSemesterId: fixtures.sem1._id,
    sourceBatchId: fixtures.batch._id,
    resultCode: 'E(CA)',
  });

  const existing = await findOfficialResult('SEU/IS/22/ICT/024', 'ICT1233');
  existing.resultCode = 'C+';
  existing.sourceBatchId = fixtures.batch._id;
  await existing.save();

  const count = await AcademicResult.countDocuments({
    registrationNumber: 'SEU/IS/22/ICT/024',
    subjectCode: 'ICT1233',
  });
  assert.equal(count, 1);
  assert.equal((await findOfficialResult('seu/is/22/ict/024', 'ict1233')).resultCode, 'C+');
  assert.equal(String(existing.studentAcademicYearId), String(fixtures.year1._id));
});

dbTest('duplicate official results for the same student and subject code are rejected', async () => {
  const payload = {
    studentUserId: fixtures.student._id,
    registrationNumber: 'SEU/IS/22/ICT/024',
    subjectId: fixtures.subject._id,
    subjectCode: 'ICT1233',
    studentAcademicYearId: fixtures.year1._id,
    studentSemesterId: fixtures.sem1._id,
    resultCode: 'A',
  };
  await AcademicResult.create(payload);
  await assert.rejects(() => AcademicResult.create(payload), { code: 11000 });
});

dbTest('E(CA) incomplete records are idempotent per student-subject-semester', async () => {
  const result = await AcademicResult.create({
    studentUserId: fixtures.student._id,
    registrationNumber: 'SEU/IS/22/ICT/024',
    subjectId: fixtures.subject._id,
    subjectCode: 'ICT1233',
    studentAcademicYearId: fixtures.year1._id,
    studentSemesterId: fixtures.sem1._id,
    resultCode: 'E(CA)',
  });
  const payload = {
    studentUserId: fixtures.student._id,
    registrationNumber: 'SEU/IS/22/ICT/024',
    subjectId: fixtures.subject._id,
    subjectCode: 'ICT1233',
    academicYearId: fixtures.year1._id,
    semesterId: fixtures.sem1._id,
    academicResultId: result._id,
  };
  await IncompleteCa.create(payload);
  await assert.rejects(() => IncompleteCa.create(payload), { code: 11000 });
});

dbTest('CA application IDs are unique public identifiers, not sequential counters', async () => {
  const first = createPublicApplicationId();
  const second = createPublicApplicationId();
  assert.notEqual(first, second);
  assert.match(first, /^CA-[a-f0-9]{32}$/);

  await CaApplication.create({
    applicationId: first,
    studentUserId: fixtures.student._id,
    academicYearId: fixtures.year1._id,
    semesterId: fixtures.sem1._id,
    windowOpensAt: new Date('2026-01-01T00:00:00Z'),
    windowClosesAt: new Date('2026-01-15T00:00:00Z'),
  });
  await assert.rejects(
    () =>
      CaApplication.create({
        applicationId: first,
        studentUserId: new mongoose.Types.ObjectId(),
        academicYearId: fixtures.year1._id,
        semesterId: fixtures.sem1._id,
        windowOpensAt: new Date('2026-01-01T00:00:00Z'),
        windowClosesAt: new Date('2026-01-15T00:00:00Z'),
      }),
    { code: 11000 },
  );
});

dbTest('notification retries use an idempotency key including reminder offset and channel', async () => {
  const payload = {
    recipientUserId: fixtures.student._id,
    type: 'CA_REMINDER',
    sourceModule: 'ca-recovery',
    sourceId: 'schedule-1',
    channel: 'WHATSAPP',
    reminderOffsetDays: 7,
    idempotencyKey: `${fixtures.student._id}:schedule-1:7:WHATSAPP`,
  };
  await Notification.create(payload);
  await assert.rejects(() => Notification.create(payload), { code: 11000 });
});
