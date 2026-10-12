import { CaRecoveryResultReview } from '../models/ca-recovery-result-review.model.js';
import { AcademicResult } from '../../results/models/academic-result.model.js';
import { ResultRevision } from '../../results/models/result-revision.model.js';
import { ECA_RESULT_CODE } from '../../results/constants.js';
import { isKnownGrade } from '../../results/services/normalize.js';
import { syncIncompleteCaFromResult } from './eca-from-results.js';
import { recalculateStudentGpa } from '../../gpa-cgpa/index.js';
import {
  LecturerAssignment,
  StudentAcademicContext,
  SubjectOffering,
} from '../../academic-foundation/index.js';
import { recordAudit as persistAudit } from '../../audit-security/services/record-audit.service.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { requireObjectId } from '../../results/utils/http.js';

function mapReview(doc) {
  return {
    id: String(doc._id),
    academicResultId: String(doc.academicResultId),
    registrationNumber: doc.registrationNumber,
    subjectCode: doc.subjectCode,
    rawResultCode: doc.rawResultCode,
    status: doc.status,
    sourceImportId: doc.sourceImportId ? String(doc.sourceImportId) : null,
    reviewerUserId: doc.reviewerUserId ? String(doc.reviewerUserId) : null,
    decision: doc.decision || '',
    decidedAt: doc.decidedAt || null,
    createdAt: doc.createdAt,
  };
}

export async function findPendingRecoveryReview(academicResultId) {
  if (!academicResultId) {
    return null;
  }
  return CaRecoveryResultReview.findOne({ academicResultId, status: 'PENDING' });
}

export async function submitPendingCaRecovery({
  result,
  rawResultCode,
  importId,
  importRowId,
  actorUserId,
}) {
  if (!result || result.resultCode !== ECA_RESULT_CODE) {
    throw new ValidationError('CA recovery review applies only to an official E(CA) result');
  }
  if (!isKnownGrade(rawResultCode)) {
    throw new ValidationError('CA recovery requires a recognized grade');
  }
  const existing = await findPendingRecoveryReview(result._id);
  if (existing) {
    if (existing.rawResultCode === rawResultCode) {
      return mapReview(existing);
    }
    throw new ConflictError('A different CA recovery grade is already pending review');
  }
  try {
    const created = await CaRecoveryResultReview.create({
      departmentId: result.departmentId,
      academicResultId: result._id,
      studentUserId: result.studentUserId,
      registrationNumber: result.registrationNumber,
      subjectCode: result.subjectCode,
      subjectId: result.subjectId,
      subjectOfferingId: result.subjectOfferingId,
      sourceBatchId: result.sourceBatchId,
      sourceImportId: importId,
      sourceImportRowId: importRowId,
      rawResultCode,
      status: 'PENDING',
      submittedByUserId: actorUserId,
    });
    await persistAudit({
      actorUserId,
      action: 'ca.recovery-result.submit',
      entityType: 'CaRecoveryResultReview',
      entityId: created._id,
      departmentId: result.departmentId,
      metadata: {
        academicResultId: String(result._id),
        rawResultCode,
        importId: importId ? String(importId) : '',
      },
    });
    return mapReview(created);
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
    const raced = await findPendingRecoveryReview(result._id);
    if (raced && raced.rawResultCode === rawResultCode) {
      return mapReview(raced);
    }
    throw new ConflictError('A different CA recovery grade is already pending review');
  }
}

async function assertReviewer(principal, result) {
  if (!principal) {
    throw new ForbiddenError('Forbidden');
  }
  if (principal.role === ROLES.DEPARTMENT_ADMINISTRATOR) {
    if (!principal.departmentId || String(principal.departmentId) !== String(result.departmentId)) {
      throw new ForbiddenError('Forbidden');
    }
    return;
  }
  if (principal.role !== ROLES.LECTURER) {
    throw new ForbiddenError('Forbidden');
  }
  const context = await StudentAcademicContext.findOne({ userId: result.studentUserId }).select('batchId');
  const batchId = context?.batchId || result.sourceBatchId;
  const offerings = await SubjectOffering.find({
    departmentId: result.departmentId,
    subjectId: result.subjectId,
    ...(batchId ? { batchId } : {}),
  }).select('_id');
  const offeringIds = offerings.map((item) => item._id);
  if (result.subjectOfferingId) {
    offeringIds.push(result.subjectOfferingId);
  }
  const assignment = await LecturerAssignment.findOne({
    lecturerUserId: principal.userId,
    subjectOfferingId: { $in: offeringIds },
    isActive: true,
  });
  if (!assignment) {
    throw new ForbiddenError('Forbidden');
  }
}

export async function listRecoveryResultReviews(principal) {
  if (!principal || ![ROLES.DEPARTMENT_ADMINISTRATOR, ROLES.LECTURER].includes(principal.role)) {
    throw new ForbiddenError('Forbidden');
  }
  const filter = { status: 'PENDING' };
  if (principal.role === ROLES.DEPARTMENT_ADMINISTRATOR) {
    if (!principal.departmentId) {
      throw new ValidationError('Department is not configured for this administrator');
    }
    filter.departmentId = principal.departmentId;
  } else {
    const assignments = await LecturerAssignment.find({
      lecturerUserId: principal.userId,
      isActive: true,
    }).select('subjectOfferingId');
    const offeringIds = assignments.map((item) => item.subjectOfferingId);
    const offerings = await SubjectOffering.find({ _id: { $in: offeringIds } }).select(
      'subjectId batchId departmentId',
    );
    if (!offerings.length) {
      return { items: [] };
    }
    filter.$or = offerings.map((offering) => ({
      departmentId: offering.departmentId,
      subjectId: offering.subjectId,
      sourceBatchId: offering.batchId,
    }));
  }
  const items = await CaRecoveryResultReview.find(filter).sort({ createdAt: 1 }).limit(50);
  return { items: items.map(mapReview) };
}

export async function decideRecoveryResultReview(principal, reviewId, body = {}) {
  requireObjectId(reviewId, 'review');
  const decision = String(body.decision || '').toUpperCase();
  if (!['APPROVE', 'REJECT'].includes(decision)) {
    throw new ValidationError('Decision must be APPROVE or REJECT');
  }
  const review = await CaRecoveryResultReview.findById(reviewId);
  if (!review) {
    throw new NotFoundError('CA recovery review not found');
  }
  const result = await AcademicResult.findById(review.academicResultId);
  if (!result) {
    throw new NotFoundError('Academic result not found');
  }
  await assertReviewer(principal, result);
  if (review.status !== 'PENDING') {
    throw new ConflictError('This CA recovery review is already decided');
  }
  if (result.resultCode !== ECA_RESULT_CODE) {
    throw new ConflictError('The official result is no longer E(CA)');
  }

  const claimed = await CaRecoveryResultReview.findOneAndUpdate(
    { _id: review._id, status: 'PENDING' },
    {
      $set: {
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        decision,
        reviewerUserId: principal.userId,
        decidedAt: new Date(),
      },
    },
    { new: true },
  );
  if (!claimed) {
    throw new ConflictError('This CA recovery review is already decided');
  }

  if (decision === 'REJECT') {
    await persistAudit({
      actorUserId: principal.userId,
      action: 'ca.recovery-result.reject',
      entityType: 'CaRecoveryResultReview',
      entityId: claimed._id,
      departmentId: result.departmentId,
      metadata: { academicResultId: String(result._id), rawResultCode: claimed.rawResultCode },
    });
    return mapReview(claimed);
  }

  const previousResultCode = result.resultCode;
  result.previousResultCode = previousResultCode;
  result.resultCode = claimed.rawResultCode;
  result.rawResultCode = claimed.rawResultCode;
  result.gradeCapApplied = false;
  result.gradeCapReason = '';
  result.isEca = false;
  result.version += 1;
  result.committedByUserId = principal.userId;
  await result.save();
  await ResultRevision.create({
    academicResultId: result._id,
    importId: claimed.sourceImportId,
    actorUserId: principal.userId,
    registrationNumber: result.registrationNumber,
    subjectCode: result.subjectCode,
    previousResultCode,
    newResultCode: claimed.rawResultCode,
    rawResultCode: claimed.rawResultCode,
    gradeCapApplied: false,
    gradeCapReason: '',
    caRecoveryReviewId: claimed._id,
  });
  await syncIncompleteCaFromResult(result);
  await recalculateStudentGpa(result.studentUserId);
  await persistAudit({
    actorUserId: principal.userId,
    action: 'ca.recovery-result.approve',
    entityType: 'CaRecoveryResultReview',
    entityId: claimed._id,
    departmentId: result.departmentId,
    metadata: {
      academicResultId: String(result._id),
      previousResultCode,
      officialResultCode: claimed.rawResultCode,
    },
  });
  return mapReview(claimed);
}
