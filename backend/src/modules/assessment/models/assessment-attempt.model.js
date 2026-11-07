import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

export const ATTEMPT_STAGES = Object.freeze([
  'DRAFT',
  'SUBMITTED',
  'RETURNED',
  'VERIFIED',
  'BOARD_AUTHORIZED',
  'PUBLISHED',
  'VOIDED',
]);

export const ATTEMPT_OUTCOME_VALUES = Object.freeze([
  'SAT',
  'ABSENT',
  'ABSENT_PENDING_MEDICAL',
  'ABSENT_MEDICAL_APPROVED',
  'NOT_REGISTERED_LAPSED',
  'CANCELLED_MISCONDUCT',
  'VOIDED',
]);

const configSnapshotSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, enum: ['CA', 'ESA'] },
    applicable: { type: Boolean, required: true },
    weight: { type: Number, default: null },
    passMark: { type: Number, default: null },
  },
  { _id: false },
);

/**
 * One sitting of the CA component for a CA-recovery subject. The lecturer enters CA marks only.
 * ESA marks come from the Examination unit through results import, never from this record.
 * Nothing in the current GPA or CA flow reads this collection.
 */
const assessmentAttemptSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    caApplicationSubjectId: { type: objectId, ref: 'CaApplicationSubject', required: true },
    academicResultId: { type: objectId, ref: 'AcademicResult', required: true },
    studentUserId: { type: objectId, ref: 'User', required: true },
    registrationNumber: { type: String, required: true, trim: true },
    subjectId: { type: objectId, ref: 'Subject', required: true },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering', required: true },
    component: { type: String, required: true, enum: ['CA'], default: 'CA' },
    /** Chronological sitting number for this result and component. */
    opportunityNumber: { type: Number, required: true, min: 1 },
    /** null when the sitting does not count toward the repeat limit. */
    countedAttemptNumber: { type: Number, default: null, min: 1 },
    candidateStatus: { type: String, required: true, enum: ['FRESH', 'REPEAT'] },
    outcome: { type: String, required: true, enum: ATTEMPT_OUTCOME_VALUES, default: 'SAT' },
    stage: { type: String, required: true, enum: ATTEMPT_STAGES, default: 'DRAFT' },
    /** CA mark as a percentage of the CA component maximum. null until entered. */
    caMark: { type: Number, default: null, min: 0, max: 100 },
    /** Config used when the attempt was opened. Later config versions never change it. */
    assessmentConfigId: { type: objectId, ref: 'OfferingAssessmentConfig' },
    assessmentConfigVersion: { type: Number },
    configSnapshot: { type: [configSnapshotSchema], default: [] },
    caPassed: { type: Boolean, default: null },
    /** Result code the system proposes from the CA outcome. The Board may authorize a different one. */
    proposedResultCode: { type: String, trim: true, default: '' },
    submittedAt: Date,
    submittedByUserId: { type: objectId, ref: 'User' },
    verifiedAt: Date,
    verifiedByUserId: { type: objectId, ref: 'User' },
    returnReason: { type: String, trim: true, default: '' },
    boardAuthorizationId: { type: objectId, ref: 'BoardAuthorization' },
    publishedAt: Date,
    publishedByUserId: { type: objectId, ref: 'User' },
    publishedResultCode: { type: String, trim: true, default: '' },
    voidReason: { type: String, trim: true, default: '' },
  },
  persistenceOptions,
);

assessmentAttemptSchema.index({ academicResultId: 1, component: 1, opportunityNumber: 1 }, { unique: true });
assessmentAttemptSchema.index({ caApplicationSubjectId: 1 });
assessmentAttemptSchema.index({ departmentId: 1, stage: 1 });
assessmentAttemptSchema.index({ subjectOfferingId: 1, stage: 1 });

export const AssessmentAttempt = defineModel('AssessmentAttempt', assessmentAttemptSchema);
