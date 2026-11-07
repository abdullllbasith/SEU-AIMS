import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { User } from '../../src/modules/authentication/models/user.model.js';
import { Department } from '../../src/modules/academic-foundation/models/department.model.js';
import { Batch } from '../../src/modules/academic-foundation/models/batch.model.js';
import { AcademicYear } from '../../src/modules/academic-foundation/models/academic-year.model.js';
import { Semester } from '../../src/modules/academic-foundation/models/semester.model.js';
import { Subject } from '../../src/modules/academic-foundation/models/subject.model.js';
import { SubjectOffering } from '../../src/modules/academic-foundation/models/subject-offering.model.js';
import { LecturerAssignment } from '../../src/modules/academic-foundation/models/lecturer-assignment.model.js';
import { StudentAcademicContext } from '../../src/modules/academic-foundation/models/student-academic-context.model.js';
import { AcademicResult } from '../../src/modules/results/models/academic-result.model.js';
import { ResultRevision } from '../../src/modules/results/models/result-revision.model.js';
import { IncompleteCa } from '../../src/modules/ca-recovery/models/incomplete-ca.model.js';
import { CaApplicationSubject } from '../../src/modules/ca-recovery/models/ca-application-subject.model.js';
import { syncIncompleteCaFromResult } from '../../src/modules/ca-recovery/services/eca-from-results.js';
import { AssessmentAttempt } from '../../src/modules/assessment/models/index.js';
import { requireAssessmentEnabled } from '../../src/modules/assessment/routes/index.js';
import * as lecturerApi from '../../src/modules/assessment/services/attempt.service.js';
import * as adminApi from '../../src/modules/assessment/services/admin-attempt.service.js';
import { ROLES } from '../../src/shared/constants/roles.js';

process.env.NODE_ENV = 'test';

before(async () => {
  await startIsolatedMongo();
});
after(async () => {
  await stopIsolatedMongo();
});
beforeEach(async () => {
  await clearIsolatedMongo();
});

async function user(role, email, departmentId) {
  return User.create({
    role,
    email,
    displayName: email,
    accountStatus: 'ACTIVE',
    departmentId,
    passwordHash: 'x'.repeat(20),
    lecturerStatus: role === ROLES.LECTURER ? 'VERIFIED' : 'NOT_APPLICABLE',
  });
}

const principal = (u) => ({ userId: String(u._id), role: u.role, departmentId: u.departmentId ? String(u.departmentId) : undefined });

/** CIS11012 has a 40/60 scheme. The student holds E(CA) and has attended the recovery CA. */
async function setup({ linkStatus = 'COMPLETED', attended = true } = {}) {
  await clearIsolatedMongo();
  const department = await Department.create({ code: 'ICT', name: 'ICT' });
  const other = await Department.create({ code: 'BST', name: 'BST' });
  const batch = await Batch.create({ departmentId: department._id, code: '22', name: '22' });
  const year = await AcademicYear.create({ departmentId: department._id, sequence: 1, name: 'Y1' });
  const semester = await Semester.create({ departmentId: department._id, academicYearId: year._id, sequence: 1, name: 'S1' });
  const subject = await Subject.create({ departmentId: department._id, code: 'CIS11012', name: 'Intro', credits: 2 });
  const offering = await SubjectOffering.create({
    departmentId: department._id,
    subjectId: subject._id,
    batchId: batch._id,
    academicYearId: year._id,
    semesterId: semester._id,
  });
  const admin = await user(ROLES.DEPARTMENT_ADMINISTRATOR, 'admin@x.test', department._id);
  const otherAdmin = await user(ROLES.DEPARTMENT_ADMINISTRATOR, 'oadmin@x.test', other._id);
  const lecturer = await user(ROLES.LECTURER, 'l1@x.test', department._id);
  const stranger = await user(ROLES.LECTURER, 'l2@x.test', department._id);
  const student = await user(ROLES.STUDENT, 's1@x.test', department._id);
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
    registrationNumber: 'SEU/IS/22/ICT/001',
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
  });
  const result = await AcademicResult.create({
    departmentId: department._id,
    studentUserId: student._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    subjectId: subject._id,
    subjectCode: subject.code,
    subjectOfferingId: offering._id,
    studentAcademicYearId: year._id,
    studentSemesterId: semester._id,
    resultCode: 'E(CA)',
    isEca: true,
    committedByUserId: admin._id,
  });
  const condition = await syncIncompleteCaFromResult(result);
  const link = await CaApplicationSubject.create({
    applicationId: new mongoose.Types.ObjectId(),
    incompleteCaId: condition._id,
    subjectId: subject._id,
    subjectOfferingId: offering._id,
    examStatus: linkStatus,
    attended,
  });
  return {
    result,
    condition,
    link,
    admin: principal(admin),
    otherAdmin: principal(otherAdmin),
    lecturer: principal(lecturer),
    stranger: principal(stranger),
    student: principal(student),
  };
}

async function toBoardAuthorized(w, { ca = 55, esa = 60 } = {}) {
  const attempt = await lecturerApi.openAttempt(w.lecturer, { linkId: String(w.link._id) });
  await lecturerApi.saveMarks(w.lecturer, attempt.id, { caMark: ca });
  await lecturerApi.submitAttempt(w.lecturer, attempt.id);
  const verified = await adminApi.verifyAttempt(w.admin, attempt.id, { esaMark: esa });
  await adminApi.recordBoardAuthorization(w.admin, attempt.id, {
    scope: 'GRADE_PUBLICATION',
    reference: 'FB/2026/07',
    meetingDate: '2026-07-01',
  });
  return { id: attempt.id, verified };
}

test('full path: attempt, verify, Board, cap decision, publish updates the official grade once', async () => {
  const w = await setup();
  const { id, verified } = await toBoardAuthorized(w, { ca: 55, esa: 60 });
  assert.equal(verified.finalMark, 58);
  assert.equal(verified.proposedResultCode, 'B-');
  assert.equal((await AcademicResult.findById(w.result._id)).resultCode, 'E(CA)', 'no grade change before publish');

  await assert.rejects(adminApi.publishAttempt(w.admin, id), /cap decision/);
  await adminApi.recordBoardAuthorization(w.admin, id, {
    scope: 'CAP_DECISION',
    reference: 'FB/2026/07-cap',
    meetingDate: '2026-07-01',
    authorizedResultCode: 'B-',
    decisionText: 'Cap not applied to E(CA) recovery',
  });
  const published = await adminApi.publishAttempt(w.admin, id);
  assert.equal(published.stage, 'PUBLISHED');

  const result = await AcademicResult.findById(w.result._id);
  assert.equal(result.resultCode, 'B-');
  assert.equal(result.version, 2);
  assert.equal(result.isEca, false);
  assert.equal((await IncompleteCa.findById(w.condition._id)).status, 'RESOLVED');
  const revisions = await ResultRevision.find({ academicResultId: result._id });
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].changeKind, 'ATTEMPT_PUBLISH');
  assert.equal(String(revisions[0].attemptId), id);

  await adminApi.publishAttempt(w.admin, id);
  assert.equal((await AcademicResult.findById(w.result._id)).version, 2, 'second publish changes nothing');
  assert.equal(await ResultRevision.countDocuments({ academicResultId: result._id }), 1);
});

test('a grade at or below C needs no cap decision; a failed CA keeps E(CA) and changes no grade', async () => {
  const w = await setup();
  const { id, verified } = await toBoardAuthorized(w, { ca: 45, esa: 45 });
  assert.equal(verified.proposedResultCode, 'C');
  await adminApi.publishAttempt(w.admin, id);
  assert.equal((await AcademicResult.findById(w.result._id)).resultCode, 'C');

  const w2 = await setup();
  const failed = await toBoardAuthorized(w2, { ca: 30, esa: 70 });
  assert.equal(failed.verified.proposedResultCode, 'E(CA)');
  await adminApi.publishAttempt(w2.admin, failed.id);
  const result = await AcademicResult.findById(w2.result._id);
  assert.equal(result.resultCode, 'E(CA)');
  assert.equal(result.version, 1);
  assert.equal((await AssessmentAttempt.findById(failed.id)).stage, 'PUBLISHED');
});

test('override needs a Board override naming that exact code', async () => {
  const w = await setup();
  const { id } = await toBoardAuthorized(w, { ca: 40, esa: 46 });
  await assert.rejects(adminApi.publishAttempt(w.admin, id, { resultCode: 'C+' }), /Board override/);
  await adminApi.recordBoardAuthorization(w.admin, id, {
    scope: 'GRADE_OVERRIDE',
    reference: 'FB/2026/08',
    meetingDate: '2026-07-02',
    authorizedResultCode: 'D',
    decisionText: 'Board relative grading',
  });
  await assert.rejects(adminApi.publishAttempt(w.admin, id, { resultCode: 'C+' }), /Board override/);
  await adminApi.publishAttempt(w.admin, id, { resultCode: 'D' });
  assert.equal((await AcademicResult.findById(w.result._id)).resultCode, 'D');
});

test('stages cannot be skipped and roles are enforced', async () => {
  const w = await setup();
  const attempt = await lecturerApi.openAttempt(w.lecturer, { linkId: String(w.link._id) });
  assert.equal((await lecturerApi.openAttempt(w.lecturer, { linkId: String(w.link._id) })).id, attempt.id, 'open is idempotent');
  await assert.rejects(lecturerApi.submitAttempt(w.lecturer, attempt.id), /Enter the CA mark/);
  await assert.rejects(lecturerApi.saveMarks(w.lecturer, attempt.id, { caMark: 50, ESA: 60 }), /Examination unit/);
  await assert.rejects(lecturerApi.saveMarks(w.lecturer, attempt.id, { caMark: 101 }), /0 to 100/);
  await lecturerApi.saveMarks(w.lecturer, attempt.id, { caMark: 50 });
  await assert.rejects(adminApi.verifyAttempt(w.admin, attempt.id, { esaMark: 60 }), /submitted/);
  await assert.rejects(adminApi.publishAttempt(w.admin, attempt.id), /Board authorized/);
  await lecturerApi.submitAttempt(w.lecturer, attempt.id);
  await assert.rejects(lecturerApi.saveMarks(w.lecturer, attempt.id, { caMark: 60 }), /draft or returned/);
  await assert.rejects(adminApi.verifyAttempt(w.admin, attempt.id, {}), /ESA mark/);

  await assert.rejects(adminApi.verifyAttempt(w.lecturer, attempt.id, { esaMark: 60 }), /Forbidden/);
  await assert.rejects(lecturerApi.openAttempt(w.admin, { linkId: String(w.link._id) }), /Forbidden/);
  await assert.rejects(lecturerApi.openAttempt(w.stranger, { linkId: String(w.link._id) }));
  await assert.rejects(adminApi.verifyAttempt(w.otherAdmin, attempt.id, { esaMark: 60 }), /not found/i);
  await assert.rejects(adminApi.publishAttempt(w.student, attempt.id), /Forbidden/);
});

test('returned attempts can be corrected and resubmitted', async () => {
  const w = await setup();
  const attempt = await lecturerApi.openAttempt(w.lecturer, { linkId: String(w.link._id) });
  await lecturerApi.saveMarks(w.lecturer, attempt.id, { caMark: 50 });
  await lecturerApi.submitAttempt(w.lecturer, attempt.id);
  await assert.rejects(adminApi.returnAttempt(w.admin, attempt.id, {}), /reason/);
  const returned = await adminApi.returnAttempt(w.admin, attempt.id, { reason: 'Mark sheet mismatch' });
  assert.equal(returned.stage, 'RETURNED');
  await lecturerApi.saveMarks(w.lecturer, attempt.id, { caMark: 52 });
  assert.equal((await lecturerApi.submitAttempt(w.lecturer, attempt.id)).stage, 'SUBMITTED');
});

test('an unattended or incomplete subject cannot open an attempt', async () => {
  const absent = await setup({ attended: false });
  await assert.rejects(lecturerApi.openAttempt(absent.lecturer, { linkId: String(absent.link._id) }), /attended/);
  const pending = await setup({ linkStatus: 'SCHEDULED' });
  await assert.rejects(lecturerApi.openAttempt(pending.lecturer, { linkId: String(pending.link._id) }), /attended/);
});

test('repeat limit refuses a fourth repeat unless a grace chance is recorded', async () => {
  const w = await setup();
  const first = await lecturerApi.openAttempt(w.lecturer, { linkId: String(w.link._id) });
  // Four earlier counted sittings on the same result.
  await AssessmentAttempt.deleteMany({});
  for (let n = 1; n <= 4; n += 1) {
    await AssessmentAttempt.create({
      departmentId: w.result.departmentId,
      caApplicationSubjectId: new mongoose.Types.ObjectId(),
      academicResultId: w.result._id,
      studentUserId: w.result.studentUserId,
      registrationNumber: w.result.registrationNumber,
      subjectId: w.result.subjectId,
      subjectOfferingId: w.link.subjectOfferingId,
      opportunityNumber: n,
      countedAttemptNumber: n,
      candidateStatus: n === 1 ? 'FRESH' : 'REPEAT',
      outcome: 'SAT',
      stage: 'PUBLISHED',
    });
  }
  assert.ok(first.id);
  await assert.rejects(lecturerApi.openAttempt(w.lecturer, { linkId: String(w.link._id) }), /repeat limit/);
});

test('absent attempt counts; an approved medical does not; a rejected one does', async () => {
  const w = await setup({ linkStatus: 'MISSED', attended: false });
  const absent = await adminApi.recordAbsentAttempt(w.admin, String(w.link._id));
  assert.equal(absent.outcome, 'ABSENT');
  assert.equal(absent.countedAttemptNumber, 1);
  assert.equal((await AcademicResult.findById(w.result._id)).resultCode, 'E(CA)');

  const claim = await adminApi.recordAbsenceClaim(w.admin, absent.id, {
    examDate: '2026-06-01',
    notifiedAt: '2026-06-04',
    documentReceivedAt: '2026-06-10',
    semesterExamEndDate: '2026-06-20',
    issuerCategory: 'GOVERNMENT_HOSPITAL',
  });
  assert.equal(claim.noticeLate, true, 'notice after 48 hours is flagged, not rejected');
  assert.equal(claim.documentLate, false);
  assert.equal(claim.attempt.outcome, 'ABSENT_PENDING_MEDICAL');
  assert.equal(claim.attempt.countedAttemptNumber, null);
  await assert.rejects(
    adminApi.decideAbsenceClaim(w.admin, absent.id, claim.claimId, { decision: 'APPROVED' }),
    /Senate reference/,
  );
  const approved = await adminApi.decideAbsenceClaim(w.admin, absent.id, claim.claimId, {
    decision: 'APPROVED',
    senateReference: 'SEN/2026/12',
  });
  assert.equal(approved.outcome, 'ABSENT_MEDICAL_APPROVED');
  assert.equal(approved.countedAttemptNumber, null);
  await assert.rejects(
    adminApi.decideAbsenceClaim(w.admin, absent.id, claim.claimId, { decision: 'REJECTED', senateReference: 'x' }),
    /already decided/,
  );

  const w2 = await setup({ linkStatus: 'MISSED', attended: false });
  const absent2 = await adminApi.recordAbsentAttempt(w2.admin, String(w2.link._id));
  const claim2 = await adminApi.recordAbsenceClaim(w2.admin, absent2.id, {
    examDate: '2026-06-01',
    notifiedAt: '2026-06-01',
    issuerCategory: 'UNIVERSITY_MEDICAL_OFFICER',
  });
  assert.equal(claim2.documentLate, true, 'missing document is flagged');
  const rejected = await adminApi.decideAbsenceClaim(w2.admin, absent2.id, claim2.claimId, {
    decision: 'REJECTED',
    senateReference: 'SEN/2026/13',
  });
  assert.equal(rejected.outcome, 'ABSENT');
  assert.equal(rejected.countedAttemptNumber, 1);
});

test('routes answer 404 while ASSESSMENT_MARKS_ENABLED is off', () => {
  for (const [enabled, expectNotFound] of [[false, true], [true, false]]) {
    let error = null;
    requireAssessmentEnabled(
      { app: { get: () => ({ features: { assessmentMarksEnabled: enabled } }) } },
      {},
      (value) => {
        error = value || null;
      },
    );
    assert.equal(Boolean(error), expectNotFound);
    if (error) {
      assert.equal(error.statusCode, 404);
    }
  }
});
