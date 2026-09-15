import mongoose from 'mongoose';
import { MATCH_STATUSES, ROW_STATUSES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const resultImportRowSchema = new mongoose.Schema(
  {
    importId: { type: objectId, ref: 'ResultImport', required: true },
    registrationNumber: { type: String, required: true, trim: true, uppercase: true },
    subjectCode: { type: String, required: true, trim: true, uppercase: true },
    resultCode: { type: String, required: true, trim: true },
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
    proposedAction: { type: String, enum: ['NEW', 'UPDATE', 'SKIP'], default: 'SKIP' },
    isEca: { type: Boolean, default: false },
    committedAt: Date,
  },
  persistenceOptions,
);

resultImportRowSchema.index({ importId: 1 });
resultImportRowSchema.index({ registrationNumber: 1, subjectCode: 1 });

export const ResultImportRow = defineModel('ResultImportRow', resultImportRowSchema);
