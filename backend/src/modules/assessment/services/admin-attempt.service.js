import mongoose from 'mongoose';
import { AssessmentAttempt } from '../models/assessment-attempt.model.js';
import { BoardAuthorization, BOARD_SCOPES } from '../models/board-authorization.model.js';
import { AbsenceClaim, MEDICAL_ISSUER_CATEGORIES } from '../models/absence-claim.model.js';
import {
  CaApplicationSubject,
  IncompleteCa,
  recordCaAudit,
  syncIncompleteCaFromResult,
} from '../../ca-recovery/index.js';
import {
  AcademicResult,
  CAP_TREATMENTS,
  DICT_GRADE_POINTS,
  ECA_RESULT_CODE,
  OFFICIAL_RESULT_CHANGE_KINDS,
  applyOfficialResultChange,
  evaluateRepeatCap,
} from '../../results/index.js';
import { recalculateStudentGpa } from '../../gpa-cgpa/index.js';
import { Subject } from '../../academic-foundation/index.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { summarizeAttempts, canOpenAttempt } from '../rules/attempt-counting.js';
import { computeFinalMark } from '../rules/final-mark.js';
import { proposeResultCode } from '../rules/grade-proposal.js';
import { mapAttempt } from './attempt.service.js';
import { notifyStudentOfPublication } from './notify.service.js';

const HOURS_48 = 48 * 60 * 60 * 1000;

/** Grades above C need a Board cap decision before replacing E(CA). */
function aboveCgrade(code) {
  return (DICT_GRADE_POINTS[code] ?? 0) > DICT_GRADE_POINTS.C;
}
const DAYS_14 = 14 * 24 * 60 * 60 * 1000;

function assertAdmin(principal) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR) {
    throw new ForbiddenError('Forbidden');
  }
}

function requireId(value, label) {
  if (!mongoose.isValidObjectId(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return value;
}

function toDate(value, label) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new ValidationError(`${label} must be a valid date`);
  }
  return date;
}

async function loadAdminAttempt(principal, attemptId) {
  assertAdmin(principal);
  requireId(attemptId, 'attempt');
  const attempt = await AssessmentAttempt.findById(attemptId);
  if (!attempt || (principal.departmentId && String(attempt.departmentId) !== String(principal.departmentId))) {
    throw new NotFoundError('Attempt not found');
  }
  return attempt;
}

function mapAdminAttempt(attempt) {
  return {
    ...mapAttempt(attempt),
    esaMark: attempt.esaMark,
    esaPassed: attempt.esaPassed,
    finalMark: attempt.finalMark,
    proposedResultCode: attempt.proposedResultCode || '',
    boardAuthorizationId: attempt.boardAuthorizationId ? String(attempt.boardAuthorizationId) : null,
    publishedResultCode: attempt.publishedResultCode || '',
  };
}

export async function listAdminAttempts(principal, { stage } = {}) {
  assertAdmin(principal);
  const filter = {};
  if (principal.departmentId) {
    filter.departmentId = principal.departmentId;
  }
  if (stage) {
    filter.stage = String(stage);
  }
  const attempts = await AssessmentAttempt.find(filter).sort({ createdAt: -1 }).limit(200);
  const decisions = await BoardAuthorization.find({
    departmentId: principal.departmentId || attempts[0]?.departmentId,
    scope: 'CAP_DECISION',
    coveredAttemptIds: { $in: attempts.map((a) => a._id) },
  }).select('coveredAttemptIds authorizedResultCode');
  const recorded = new Set(
    decisions.flatMap((d) => d.coveredAttemptIds.map((id) => `${String(id)}:${d.authorizedResultCode}`)),
  );
  return attempts.map((attempt) => ({
    ...mapAdminAttempt(attempt),
    capDecisionRequired: aboveCgrade(attempt.proposedResultCode),
    capDecisionRecorded: recorded.has(`${String(attempt._id)}:${attempt.proposedResultCode}`),
  }));
}

/**
 * Administrator verifies a SUBMITTED attempt. The ESA mark comes from the Examination unit sheet and is
 * entered here. The system then computes the weighted mark and proposes a result code.
 */
export async function verifyAttempt(principal, attemptId, body = {}) {
  const attempt = await loadAdminAttempt(principal, attemptId);
  if (attempt.stage !== 'SUBMITTED') {
    throw new ConflictError('Only a submitted attempt can be verified');
  }
  const ca = attempt.configSnapshot.find((c) => c.key === 'CA');
  const esa = attempt.configSnapshot.find((c) => c.key === 'ESA');
  const esaApplicable = Boolean(esa?.applicable);
  let esaMark = null;
  if (esaApplicable) {
    esaMark = body.esaMark;
    if (typeof esaMark !== 'number' || !Number.isFinite(esaMark) || esaMark < 0 || esaMark > 100) {
      throw new ValidationError('ESA mark from the Examination unit sheet is required (0 to 100)');
    }
  } else if (body.esaMark !== undefined && body.esaMark !== null) {
    throw new ValidationError('This subject has no ESA component');
  }
  const scheme = { status: 'VERIFIED', components: attempt.configSnapshot.map((c) => c.toObject?.() || c) };
  const caPassed = attempt.caMark >= ca.passMark;
  const esaPassed = esaApplicable ? esaMark >= esa.passMark : null;
  const finalMark = computeFinalMark(scheme, { CA: attempt.caMark, ESA: esaMark });
  const proposedResultCode = proposeResultCode({ caPassed, esaPassed, esaApplicable, finalMark }) || '';
  const claimed = await AssessmentAttempt.findOneAndUpdate(
    { _id: attempt._id, stage: 'SUBMITTED' },
    {
      $set: {
        stage: 'VERIFIED',
        esaMark,
        esaPassed,
        caPassed,
        finalMark,
        proposedResultCode,
        verifiedAt: new Date(),
        verifiedByUserId: principal.userId,
      },
    },
    { new: true },
  );
  if (!claimed) {
    throw new ConflictError('This attempt changed. Reload and try again.');
  }
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'assessment.attempt.verify',
    entityType: 'AssessmentAttempt',
    entityId: claimed._id,
    departmentId: claimed.departmentId,
    metadata: { proposedResultCode },
  });
  return mapAdminAttempt(claimed);
}

/**
 * Administrator corrects the CA and/or ESA mark on a verified attempt before publication. Every change needs a
 * reason and is audited with old and new values. The proposed code is recalculated. Any Board authorization
 * already recorded for this attempt is invalidated, so the Board reference and cap decision must be recorded again.
 */
export async function correctAttemptMarks(principal, attemptId, body = {}) {
  const attempt = await loadAdminAttempt(principal, attemptId);
  if (!['VERIFIED', 'BOARD_AUTHORIZED'].includes(attempt.stage)) {
    throw new ConflictError('Marks can only be corrected on a verified attempt before publication');
  }
  const reason = String(body.reason || '').trim();
  if (!reason) {
    throw new ValidationError('A reason is required for a mark correction');
  }
  const ca = attempt.configSnapshot.find((c) => c.key === 'CA');
  const esa = attempt.configSnapshot.find((c) => c.key === 'ESA');
  const esaApplicable = Boolean(esa?.applicable);
  const isMark = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  const caMark = body.caMark === undefined ? attempt.caMark : Number(body.caMark);
  if (!isMark(caMark)) {
    throw new ValidationError('CA mark must be a number from 0 to 100');
  }
  let esaMark = null;
  if (esaApplicable) {
    esaMark = body.esaMark === undefined ? attempt.esaMark : Number(body.esaMark);
    if (!isMark(esaMark)) {
      throw new ValidationError('ESA mark must be a number from 0 to 100');
    }
  } else if (body.esaMark !== undefined && body.esaMark !== null && body.esaMark !== '') {
    throw new ValidationError('This subject has no ESA component');
  }
  const scheme = { status: 'VERIFIED', components: attempt.configSnapshot.map((c) => c.toObject?.() || c) };
  const caPassed = caMark >= ca.passMark;
  const esaPassed = esaApplicable ? esaMark >= esa.passMark : null;
  const finalMark = computeFinalMark(scheme, { CA: caMark, ESA: esaMark });
  const proposedResultCode = proposeResultCode({ caPassed, esaPassed, esaApplicable, finalMark }) || '';
  const before = { caMark: attempt.caMark, esaMark: attempt.esaMark, proposedResultCode: attempt.proposedResultCode };
  const after = { caMark, esaMark, proposedResultCode };
  if (JSON.stringify(before) === JSON.stringify(after)) {
    throw new ValidationError('The marks are unchanged');
  }
  const claimed = await AssessmentAttempt.findOneAndUpdate(
    { _id: attempt._id, stage: attempt.stage },
    {
      $set: {
        stage: 'VERIFIED',
        caMark,
        caPassed,
        esaMark,
        esaPassed,
        finalMark,
        proposedResultCode,
        verifiedAt: new Date(),
        verifiedByUserId: principal.userId,
      },
      $unset: { boardAuthorizationId: '' },
    },
    { new: true },
  );
  if (!claimed) {
    throw new ConflictError('This attempt changed. Reload and try again.');
  }
  await invalidateAuthorizations(attempt._id, `Marks corrected: ${reason}`);
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'assessment.attempt.correct-marks',
    entityType: 'AssessmentAttempt',
    entityId: attempt._id,
    departmentId: attempt.departmentId,
    metadata: { reason, before, after, previousStage: attempt.stage },
  });
  return mapAdminAttempt(claimed);
}

/** Administrator sends a submitted attempt back to the lecturer. A reason is required. */
export async function returnAttempt(principal, attemptId, body = {}) {
  const attempt = await loadAdminAttempt(principal, attemptId);
  const reason = String(body.reason || '').trim();
  if (!reason) {
    throw new ValidationError('A reason is required');
  }
  if (!['SUBMITTED', 'VERIFIED', 'BOARD_AUTHORIZED'].includes(attempt.stage)) {
    throw new ConflictError('Only an unpublished attempt can be returned');
  }
  const claimed = await AssessmentAttempt.findOneAndUpdate(
    { _id: attempt._id, stage: attempt.stage },
    { $set: { stage: 'RETURNED', returnReason: reason }, $unset: { boardAuthorizationId: '' } },
    { new: true },
  );
  if (!claimed) {
    throw new ConflictError('This attempt changed. Reload and try again.');
  }
  await invalidateAuthorizations(attempt._id, `Returned to lecturer: ${reason}`);
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'assessment.attempt.return',
    entityType: 'AssessmentAttempt',
    entityId: claimed._id,
    departmentId: claimed.departmentId,
    metadata: { reason },
  });
  return mapAdminAttempt(claimed);
}

/**
 * Append a Board or Senate reference. The system links it and cannot verify the Board met.
 * GRADE_PUBLICATION also moves the covered VERIFIED attempt to BOARD_AUTHORIZED.
 */
export async function recordBoardAuthorization(principal, attemptId, body = {}) {
  const attempt = await loadAdminAttempt(principal, attemptId);
  const scope = String(body.scope || 'GRADE_PUBLICATION');
  if (!BOARD_SCOPES.includes(scope)) {
    throw new ValidationError('Unknown authorization scope');
  }
  const reference = String(body.reference || '').trim();
  if (!reference) {
    throw new ValidationError('A Board or Senate reference is required');
  }
  const meetingDate = toDate(body.meetingDate, 'Meeting date');
  const authorizedResultCode = String(body.authorizedResultCode || '').trim();
  if (['GRADE_OVERRIDE', 'CAP_DECISION', 'CORRECTION'].includes(scope) && !authorizedResultCode) {
    throw new ValidationError('The authorized result code is required for this scope');
  }
  if (['GRADE_OVERRIDE', 'CAP_DECISION', 'ATTEMPT_VOID'].includes(scope) && !String(body.decisionText || '').trim()) {
    throw new ValidationError('A reason is required for this scope');
  }
  if (attempt.stage === 'PUBLISHED' || attempt.stage === 'VOIDED') {
    throw new ConflictError('This attempt is already closed');
  }
  const authorization = await BoardAuthorization.create({
    departmentId: attempt.departmentId,
    scope,
    reference,
    meetingDate,
    decisionText: String(body.decisionText || '').trim(),
    authorizedResultCode,
    coveredAttemptIds: [attempt._id],
    resultId: attempt.academicResultId,
    recordedByUserId: principal.userId,
  });
  let current = attempt;
  if (scope === 'GRADE_PUBLICATION' && attempt.stage === 'VERIFIED') {
    current =
      (await AssessmentAttempt.findOneAndUpdate(
        { _id: attempt._id, stage: 'VERIFIED' },
        { $set: { stage: 'BOARD_AUTHORIZED', boardAuthorizationId: authorization._id } },
        { new: true },
      )) || attempt;
  }
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'assessment.board-authorization.record',
    entityType: 'BoardAuthorization',
    entityId: authorization._id,
    departmentId: attempt.departmentId,
    metadata: { attemptId: String(attempt._id), scope, reference, authorizedResultCode },
  });
  return { authorizationId: String(authorization._id), attempt: mapAdminAttempt(current) };
}

async function invalidateAuthorizations(attemptId, reason) {
  await BoardAuthorization.updateMany(
    { coveredAttemptIds: attemptId, invalidatedAt: null },
    { $set: { invalidatedAt: new Date(), invalidatedReason: reason } },
  );
}

async function findAuthorization(attempt, scope, resultCode) {
  return BoardAuthorization.findOne({
    departmentId: attempt.departmentId,
    scope,
    coveredAttemptIds: attempt._id,
    invalidatedAt: null,
    ...(resultCode ? { authorizedResultCode: resultCode } : {}),
  }).sort({ createdAt: -1 });
}

/**
 * Publish a BOARD_AUTHORIZED attempt through the single official-result writer.
 * - The code is the proposal, or an override that needs a GRADE_OVERRIDE authorization naming that exact code.
 * - A passing grade above C replacing E(CA) needs a CAP_DECISION authorization (handbook is silent on
 *   whether E(CA) counts as E for the cap, open question A1).
 * - Publishing the same code the result already has changes no grade.
 * Idempotent: a published attempt returns as is.
 */
export async function publishAttempt(principal, attemptId, body = {}, { infrastructure } = {}) {
  const attempt = await loadAdminAttempt(principal, attemptId);
  if (attempt.stage === 'PUBLISHED') {
    return mapAdminAttempt(attempt);
  }
  if (attempt.stage !== 'BOARD_AUTHORIZED') {
    throw new ConflictError('The attempt must be verified and Board authorized before publishing');
  }
  const result = await AcademicResult.findById(attempt.academicResultId);
  if (!result || String(result.departmentId) !== String(attempt.departmentId)) {
    throw new NotFoundError('Official result not found');
  }
  if (result.resultCode !== ECA_RESULT_CODE) {
    throw new ConflictError('The official result is no longer E(CA)');
  }

  const proposed = attempt.proposedResultCode;
  const requested = String(body.resultCode || '').trim() || proposed;
  if (!requested) {
    throw new ValidationError('No result code to publish');
  }
  const publication = await BoardAuthorization.findById(attempt.boardAuthorizationId);
  let authorizationId = publication?._id;
  if (requested !== proposed) {
    const override = await findAuthorization(attempt, 'GRADE_OVERRIDE', requested);
    if (!override) {
      throw new ForbiddenError('Publishing a code other than the proposal needs a recorded Board override for that exact code');
    }
    authorizationId = override._id;
  }

  const cap = evaluateRepeatCap(result.resultCode, requested);
  let officialResultCode = requested;
  let gradeCapApplied = false;
  let gradeCapReason = '';
  const aboveC = (DICT_GRADE_POINTS[requested] ?? 0) > DICT_GRADE_POINTS.C;
  if (cap.treatment === CAP_TREATMENTS.LEGACY_PRESERVED_UNCONFIRMED && aboveC) {
    const decision = await findAuthorization(attempt, 'CAP_DECISION', requested);
    if (!decision) {
      throw new ForbiddenError(
        'A Board cap decision naming the code to publish is required before a grade above C replaces E(CA)',
      );
    }
    authorizationId = decision._id;
  } else if (cap.gradeCapApplied) {
    officialResultCode = cap.officialResultCode;
    gradeCapApplied = true;
    gradeCapReason = cap.gradeCapReason;
  }

  const claimed = await AssessmentAttempt.findOneAndUpdate(
    { _id: attempt._id, stage: 'BOARD_AUTHORIZED' },
    {
      $set: {
        stage: 'PUBLISHED',
        publishedAt: new Date(),
        publishedByUserId: principal.userId,
        publishedResultCode: officialResultCode,
      },
    },
    { new: true },
  );
  if (!claimed) {
    throw new ConflictError('This attempt changed. Reload and try again.');
  }

  try {
    if (officialResultCode !== result.resultCode) {
      const previousResultCode = result.resultCode;
      await applyOfficialResultChange({
        kind: OFFICIAL_RESULT_CHANGE_KINDS.ATTEMPT_PUBLISH,
        principal,
        existing: result,
        fields: {
          previousResultCode,
          resultCode: officialResultCode,
          rawResultCode: requested,
          gradeCapApplied,
          gradeCapReason,
          isEca: officialResultCode === ECA_RESULT_CODE,
        },
        link: { attemptId: attempt._id, authorizationId },
      });
    }
    await syncIncompleteCaFromResult(result);
    await recalculateStudentGpa(result.studentUserId);
  } catch (error) {
    await AssessmentAttempt.updateOne(
      { _id: attempt._id, stage: 'PUBLISHED' },
      { $set: { stage: 'BOARD_AUTHORIZED' }, $unset: { publishedAt: '', publishedByUserId: '', publishedResultCode: '' } },
    );
    throw error;
  }
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'result.official.change',
    entityType: 'AssessmentAttempt',
    entityId: claimed._id,
    departmentId: claimed.departmentId,
    metadata: {
      kind: OFFICIAL_RESULT_CHANGE_KINDS.ATTEMPT_PUBLISH,
      academicResultId: String(result._id),
      previousResultCode: ECA_RESULT_CODE,
      newResultCode: officialResultCode,
      authorizationId: authorizationId ? String(authorizationId) : null,
    },
  });
  const subject = await Subject.findById(claimed.subjectId).select('code');
  await notifyStudentOfPublication({
    attempt: claimed,
    subjectCode: subject?.code,
    resultCode: officialResultCode,
    infrastructure,
  });
  return mapAdminAttempt(claimed);
}

/**
 * Record an absence for a MISSED subject link. The sitting counts toward the repeat limit and forfeits
 * fresh status until an approved medical says otherwise (handbook 4.3.1). No grade changes.
 */
export async function recordAbsentAttempt(principal, linkId) {
  assertAdmin(principal);
  requireId(linkId, 'subject link');
  const link = await CaApplicationSubject.findById(linkId);
  if (!link || link.examStatus !== 'MISSED') {
    throw new ValidationError('Only a missed subject can be recorded as absent');
  }
  const existing = await AssessmentAttempt.findOne({ caApplicationSubjectId: link._id, stage: { $ne: 'VOIDED' } });
  if (existing) {
    return mapAdminAttempt(existing);
  }
  const condition = await IncompleteCa.findById(link.incompleteCaId);
  const result = condition ? await AcademicResult.findById(condition.academicResultId) : null;
  if (!result || (principal.departmentId && String(result.departmentId) !== String(principal.departmentId))) {
    throw new NotFoundError('Official result not found');
  }
  const history = await AssessmentAttempt.find({ academicResultId: result._id, component: 'CA' }).sort({
    opportunityNumber: 1,
  });
  const summary = summarizeAttempts(history);
  const attempt = await AssessmentAttempt.create({
    departmentId: result.departmentId,
    caApplicationSubjectId: link._id,
    academicResultId: result._id,
    studentUserId: result.studentUserId,
    registrationNumber: result.registrationNumber,
    subjectId: result.subjectId,
    subjectOfferingId: link.subjectOfferingId,
    component: 'CA',
    opportunityNumber: history.length + 1,
    countedAttemptNumber: summary.countedSoFar + 1,
    candidateStatus: canOpenAttempt(history, { hasGraceChance: true }).candidateStatus,
    outcome: 'ABSENT',
    stage: 'PUBLISHED',
  });
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'assessment.attempt.absent',
    entityType: 'AssessmentAttempt',
    entityId: attempt._id,
    departmentId: attempt.departmentId,
    metadata: { opportunityNumber: attempt.opportunityNumber },
  });
  return mapAdminAttempt(attempt);
}

/**
 * Medical claim on an absent attempt. Late notice or document is flagged, never auto-rejected.
 * Until the Senate decides, the attempt is not counted and is flagged pending.
 */
export async function recordAbsenceClaim(principal, attemptId, body = {}) {
  const attempt = await loadAdminAttempt(principal, attemptId);
  if (attempt.outcome !== 'ABSENT') {
    throw new ConflictError('A medical claim needs an absent attempt without an open claim');
  }
  if (await AbsenceClaim.exists({ attemptId: attempt._id })) {
    throw new ConflictError('This attempt already has a medical claim');
  }
  const examDate = toDate(body.examDate, 'Exam date');
  const notifiedAt = toDate(body.notifiedAt, 'Notice date');
  const documentReceivedAt = body.documentReceivedAt ? toDate(body.documentReceivedAt, 'Document date') : null;
  const semesterExamEndDate = body.semesterExamEndDate ? toDate(body.semesterExamEndDate, 'Semester exam end date') : null;
  if (!MEDICAL_ISSUER_CATEGORIES.includes(body.issuerCategory)) {
    throw new ValidationError('Unknown medical issuer category');
  }
  const noticeLate = notifiedAt.getTime() > examDate.getTime() + HOURS_48;
  const documentLate = documentReceivedAt
    ? documentReceivedAt.getTime() > (semesterExamEndDate || examDate).getTime() + DAYS_14
    : true;
  const claimed = await AssessmentAttempt.findOneAndUpdate(
    { _id: attempt._id, outcome: 'ABSENT' },
    { $set: { outcome: 'ABSENT_PENDING_MEDICAL', countedAttemptNumber: null } },
    { new: true },
  );
  if (!claimed) {
    throw new ConflictError('This attempt changed. Reload and try again.');
  }
  const claim = await AbsenceClaim.create({
    departmentId: attempt.departmentId,
    attemptId: attempt._id,
    notifiedAt,
    documentReceivedAt,
    issuerCategory: body.issuerCategory,
    noticeLate,
    documentLate,
    recordedByUserId: principal.userId,
  });
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'assessment.absence-claim.record',
    entityType: 'AbsenceClaim',
    entityId: claim._id,
    departmentId: attempt.departmentId,
    metadata: { attemptId: String(attempt._id), noticeLate, documentLate },
  });
  return { claimId: String(claim._id), noticeLate, documentLate, attempt: mapAdminAttempt(claimed) };
}

/** Record the Senate decision. APPROVED keeps fresh status and does not count. REJECTED counts the sitting. */
export async function decideAbsenceClaim(principal, attemptId, claimId, body = {}) {
  const attempt = await loadAdminAttempt(principal, attemptId);
  requireId(claimId, 'claim');
  const decision = String(body.decision || '').toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    throw new ValidationError('Decision must be APPROVED or REJECTED');
  }
  const senateReference = String(body.senateReference || '').trim();
  if (!senateReference) {
    throw new ValidationError('A Senate reference is required');
  }
  const claim = await AbsenceClaim.findOneAndUpdate(
    { _id: claimId, attemptId: attempt._id, senateDecision: { $exists: false } },
    { $set: { senateDecision: decision, senateReference, decidedAt: new Date(), decidedByUserId: principal.userId } },
    { new: true },
  );
  if (!claim) {
    throw new ConflictError('This claim is already decided or does not belong to this attempt');
  }
  let update;
  if (decision === 'APPROVED') {
    update = { outcome: 'ABSENT_MEDICAL_APPROVED', countedAttemptNumber: null };
  } else {
    const earlier = await AssessmentAttempt.find({
      academicResultId: attempt.academicResultId,
      component: 'CA',
      opportunityNumber: { $lt: attempt.opportunityNumber },
    });
    update = { outcome: 'ABSENT', countedAttemptNumber: summarizeAttempts(earlier).countedSoFar + 1 };
  }
  const updated = await AssessmentAttempt.findByIdAndUpdate(attempt._id, { $set: update }, { new: true });
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'assessment.absence-claim.decide',
    entityType: 'AbsenceClaim',
    entityId: claim._id,
    departmentId: attempt.departmentId,
    metadata: { attemptId: String(attempt._id), decision, senateReference },
  });
  return mapAdminAttempt(updated);
}
