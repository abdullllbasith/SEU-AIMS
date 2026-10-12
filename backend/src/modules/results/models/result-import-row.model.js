import mongoose from 'mongoose';
import { MATCH_STATUSES, PROPOSED_ACTIONS, ROW_STATUSES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const resultImportRowSchema = new mongoose.Schema(
  {
    importId: { type: objectId, ref: 'ResultImport', required: true },
    registrationNumber: { type: String, required: true, trim: true, uppercase: true },
    subjectCode: { type: String, required: true, trim: true, uppercase: true },
    resultCode: { type: String, required: true, trim: true },
    sourceRegistrationNumber: { type: String, trim: true, default: '' },
    sourceSubjectCode: { type: String, trim: true, default: '' },
    sourceResultCode: { type: String, trim: true, default: '' },
    displayName: { type: String, trim: true, default: '' },
    sourceLocation: { type: String, trim: true, default: '' },
    matchedStudentUserId: { type: objectId, ref: 'User' },
    subjectId: { type: objectId, ref: 'Subject' },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering' },
    matchStatus: {
      type: String,
      enum: MATCH_STATUSES,
      default: 'UNMATCHED',
    },
    rowStatus: { type: String, enum: ROW_STATUSES, default: 'BLOCKED' },
    validationErrors: [{ type: String }],
    proposedAction: { type: String, enum: PROPOSED_ACTIONS, default: 'SKIP' },
    isEca: { type: Boolean, default: false },
    rawResultCode: { type: String, trim: true, default: '' },
    officialResultCode: { type: String, trim: true, default: '' },
    gradeCapApplied: { type: Boolean, default: false },
    gradeCapReason: { type: String, trim: true, default: '' },
    reviewRequired: { type: Boolean, default: false },
    explanation: { type: String, trim: true, default: '' },
    committedAt: Date,
  },
  persistenceOptions,
);

resultImportRowSchema.index({ importId: 1 });
resultImportRowSchema.index({ registrationNumber: 1, subjectCode: 1 });

export const ResultImportRow = defineModel('ResultImportRow', resultImportRowSchema);
