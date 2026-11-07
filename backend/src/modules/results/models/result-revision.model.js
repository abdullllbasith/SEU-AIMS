import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const resultRevisionSchema = new mongoose.Schema(
  {
    academicResultId: { type: objectId, ref: 'AcademicResult', required: true },
    importId: { type: objectId, ref: 'ResultImport' },
    actorUserId: { type: objectId, ref: 'User', required: true },
    registrationNumber: { type: String, required: true },
    subjectCode: { type: String, required: true },
    previousResultCode: { type: String, trim: true, default: '' },
    newResultCode: { type: String, required: true },
    rawResultCode: { type: String, trim: true, default: '' },
    gradeCapApplied: { type: Boolean, default: false },
    gradeCapReason: { type: String, trim: true, default: '' },
    caRecoveryReviewId: { type: objectId, ref: 'CaRecoveryResultReview' },
    /** Which authorized path produced this change. Absent on rows written before the single writer existed. */
    changeKind: { type: String, trim: true, enum: ['IMPORT_COMMIT', 'IMPORT_SOURCED_REVIEW', 'ATTEMPT_PUBLISH'] },
    attemptId: { type: objectId, ref: 'AssessmentAttempt' },
    authorizationId: { type: objectId, ref: 'BoardAuthorization' },
  },
  persistenceOptions,
);

resultRevisionSchema.index({ academicResultId: 1, createdAt: 1 });
resultRevisionSchema.index({ importId: 1 });

export const ResultRevision = defineModel('ResultRevision', resultRevisionSchema);
