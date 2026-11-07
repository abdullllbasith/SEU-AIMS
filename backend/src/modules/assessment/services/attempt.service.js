import { AssessmentAttempt } from '../models/assessment-attempt.model.js';
import { BoardAuthorization } from '../models/board-authorization.model.js';
import { CaApplicationSubject, IncompleteCa, recordCaAudit, requireManagedOffering } from '../../ca-recovery/index.js';
import { AcademicResult } from '../../results/index.js';
import { OfferingAssessmentConfig, getAssessmentScheme } from '../../academic-foundation/index.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { canOpenAttempt, summarizeAttempts } from '../rules/attempt-counting.js';
import { validateComponentMarks } from '../rules/assessment-rules.js';
import mongoose from 'mongoose';

function assertLecturer(principal) {
  if (!principal || principal.role !== ROLES.LECTURER) {
    throw new ForbiddenError('Forbidden');
  }
}

function requireId(value, label) {
  if (!mongoose.isValidObjectId(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return value;
}

/**
 * Scheme for an offering. The newest stored config version wins. Without one, the handbook
 * template for the course code is used. A missing or UNVERIFIED scheme blocks marks entry.
 */
export async function resolveOfferingScheme(subjectOfferingId, subjectCode) {
  const config = await OfferingAssessmentConfig.findOne({ subjectOfferingId }).sort({ version: -1 });
  if (config) {
    return {
      status: 'VERIFIED',
      configId: config._id,
      configVersion: config.version,
      components: config.components.map((c) => ({
        key: c.key,
        applicable: c.applicable,
        weight: c.weight,
        passMark: c.passMark,
      })),
    };
  }
  const template = getAssessmentScheme(subjectCode);
  if (!template || template.status !== 'VERIFIED') {
    return null;
  }
  return { ...template, configId: null, configVersion: null };
}

export function mapAttempt(attempt) {
  return {
    id: String(attempt._id),
    linkId: String(attempt.caApplicationSubjectId),
    registrationNumber: attempt.registrationNumber,
    subjectId: String(attempt.subjectId),
    subjectOfferingId: String(attempt.subjectOfferingId),
    component: attempt.component,
    opportunityNumber: attempt.opportunityNumber,
    countedAttemptNumber: attempt.countedAttemptNumber,
    candidateStatus: attempt.candidateStatus,
    outcome: attempt.outcome,
    stage: attempt.stage,
    caMark: attempt.caMark,
    caPassed: attempt.caPassed,
    returnReason: attempt.returnReason || '',
    submittedAt: attempt.submittedAt || null,
  };
}

async function loadOwnAttempt(principal, attemptId) {
  assertLecturer(principal);
  requireId(attemptId, 'attempt');
  const attempt = await AssessmentAttempt.findById(attemptId);
  if (!attempt) {
    throw new NotFoundError('Attempt not found');
  }
  await requireManagedOffering(principal, attempt.subjectOfferingId);
  return attempt;
}

/**
 * Open a CA attempt for a subject link. Needs: lecturer assigned to the offering, subject COMPLETED,
 * student attended, a verified scheme, and the repeat limit not reached. Returns the existing open
 * attempt for the link, so a second call never creates a second sitting.
 */
export async function openAttempt(principal, { linkId }) {
  assertLecturer(principal);
  requireId(linkId, 'subject link');
  const link = await CaApplicationSubject.findById(linkId);
  if (!link || !link.subjectOfferingId) {
    throw new NotFoundError('Subject not found');
  }
  await requireManagedOffering(principal, link.subjectOfferingId);
  if (link.examStatus !== 'COMPLETED' || link.attended !== true) {
    throw new ValidationError('The student must have attended and the subject must be completed');
  }

  const existing = await AssessmentAttempt.findOne({
    caApplicationSubjectId: link._id,
    stage: { $ne: 'VOIDED' },
  });
  if (existing) {
    return mapAttempt(existing);
  }

  const condition = await IncompleteCa.findById(link.incompleteCaId);
  const result = condition ? await AcademicResult.findById(condition.academicResultId) : null;
  if (!result) {
    throw new NotFoundError('Official result not found');
  }
  if (principal.departmentId && String(result.departmentId) !== String(principal.departmentId)) {
    throw new ForbiddenError('Forbidden');
  }
  const scheme = await resolveOfferingScheme(link.subjectOfferingId, result.subjectCode);
  if (!scheme) {
    throw new ValidationError('No verified assessment scheme exists for this subject');
  }

  const history = await AssessmentAttempt.find({
    academicResultId: result._id,
    component: 'CA',
  }).sort({ opportunityNumber: 1 });
  const grace = await BoardAuthorization.exists({
    departmentId: result.departmentId,
    scope: 'GRACE_CHANCE',
    resultId: result._id,
  });
  const decision = canOpenAttempt(history, { hasGraceChance: Boolean(grace) });
  if (!decision.allowed) {
    throw new ConflictError('The repeat limit has been reached. A recorded grace chance is required.');
  }

  let attempt;
  try {
    attempt = await AssessmentAttempt.create({
      departmentId: result.departmentId,
      caApplicationSubjectId: link._id,
      academicResultId: result._id,
      studentUserId: result.studentUserId,
      registrationNumber: result.registrationNumber,
      subjectId: result.subjectId,
      subjectOfferingId: link.subjectOfferingId,
      component: 'CA',
      opportunityNumber: history.length + 1,
      countedAttemptNumber: summarizeAttempts(history).countedSoFar + 1,
      candidateStatus: decision.candidateStatus,
      outcome: 'SAT',
      stage: 'DRAFT',
      assessmentConfigId: scheme.configId || undefined,
      assessmentConfigVersion: scheme.configVersion || undefined,
      configSnapshot: scheme.components,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ConflictError('This attempt was just opened. Reload and try again.');
    }
    throw error;
  }
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'assessment.attempt.open',
    entityType: 'AssessmentAttempt',
    entityId: attempt._id,
    departmentId: attempt.departmentId,
    metadata: { opportunityNumber: attempt.opportunityNumber, candidateStatus: attempt.candidateStatus },
  });
  return mapAttempt(attempt);
}

/** Lecturer saves the CA mark while the attempt is DRAFT or RETURNED. */
export async function saveMarks(principal, attemptId, body = {}) {
  const attempt = await loadOwnAttempt(principal, attemptId);
  if (!['DRAFT', 'RETURNED'].includes(attempt.stage)) {
    throw new ConflictError('Marks can only be changed while the attempt is a draft or returned');
  }
  if (body.ESA !== undefined || body.esaMark !== undefined) {
    throw new ValidationError('ESA marks come from the Examination unit and are not entered here');
  }
  const scheme = { status: 'VERIFIED', components: attempt.configSnapshot.map((c) => c.toObject?.() || c) };
  const caMark = body.caMark ?? body.CA;
  const problems = validateComponentMarks(scheme, { CA: caMark });
  if (problems.length || typeof caMark !== 'number') {
    throw new ValidationError('CA mark must be a number from 0 to 100');
  }
  attempt.caMark = caMark;
  await attempt.save();
  return mapAttempt(attempt);
}

/** Lecturer submits the saved CA mark for administrator verification. */
export async function submitAttempt(principal, attemptId) {
  const attempt = await loadOwnAttempt(principal, attemptId);
  if (!['DRAFT', 'RETURNED'].includes(attempt.stage)) {
    throw new ConflictError('This attempt is already submitted');
  }
  if (typeof attempt.caMark !== 'number') {
    throw new ValidationError('Enter the CA mark before submitting');
  }
  const ca = attempt.configSnapshot.find((c) => c.key === 'CA');
  const claimed = await AssessmentAttempt.findOneAndUpdate(
    { _id: attempt._id, stage: attempt.stage },
    {
      $set: {
        stage: 'SUBMITTED',
        caPassed: attempt.caMark >= ca.passMark,
        submittedAt: new Date(),
        submittedByUserId: principal.userId,
        returnReason: '',
      },
    },
    { new: true },
  );
  if (!claimed) {
    throw new ConflictError('This attempt changed. Reload and try again.');
  }
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'assessment.attempt.submit',
    entityType: 'AssessmentAttempt',
    entityId: claimed._id,
    departmentId: claimed.departmentId,
    metadata: { opportunityNumber: claimed.opportunityNumber },
  });
  return mapAttempt(claimed);
}

/** Lecturer lists attempts on offerings they are assigned to. */
export async function listLecturerAttempts(principal, { stage } = {}) {
  assertLecturer(principal);
  const filter = {};
  if (principal.departmentId) {
    filter.departmentId = principal.departmentId;
  }
  if (stage) {
    filter.stage = String(stage);
  }
  const attempts = await AssessmentAttempt.find(filter).sort({ createdAt: -1 }).limit(200);
  const allowed = [];
  const checked = new Map();
  for (const attempt of attempts) {
    const key = String(attempt.subjectOfferingId);
    if (!checked.has(key)) {
      checked.set(
        key,
        requireManagedOffering(principal, attempt.subjectOfferingId).then(
          () => true,
          () => false,
        ),
      );
    }
    if (await checked.get(key)) {
      allowed.push(mapAttempt(attempt));
    }
  }
  return allowed;
}
