import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

const caRecoveryResultReviewSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    academicResultId: { type: objectId, ref: 'AcademicResult', required: true },
    studentUserId: { type: objectId, ref: 'User', required: true },
    registrationNumber: { type: String, required: true, trim: true, uppercase: true },
    subjectCode: { type: String, required: true, trim: true, uppercase: true },
    subjectId: { type: objectId, ref: 'Subject', required: true },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering' },
    sourceBatchId: { type: objectId, ref: 'Batch' },
    sourceImportId: { type: objectId, ref: 'ResultImport', required: true },
    sourceImportRowId: { type: objectId, ref: 'ResultImportRow' },
    rawResultCode: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: REVIEW_STATUSES, default: 'PENDING' },
    submittedByUserId: { type: objectId, ref: 'User', required: true },
    reviewerUserId: { type: objectId, ref: 'User' },
    decision: { type: String, trim: true, default: '' },
    decidedAt: { type: Date, default: null },
  },
  persistenceOptions,
);

caRecoveryResultReviewSchema.index(
  { academicResultId: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } },
);
caRecoveryResultReviewSchema.index({ departmentId: 1, status: 1, createdAt: 1 });

export const CaRecoveryResultReview = defineModel('CaRecoveryResultReview', caRecoveryResultReviewSchema);
