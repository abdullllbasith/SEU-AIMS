import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const resultImportRowSchema = new mongoose.Schema(
  {
    importId: { type: objectId, ref: 'ResultImport', required: true },
    registrationNumber: { type: String, required: true, trim: true, uppercase: true },
    subjectCode: { type: String, required: true, trim: true, uppercase: true },
    resultCode: { type: String, required: true, trim: true },
    matchedStudentUserId: { type: objectId, ref: 'User' },
    matchStatus: {
      type: String,
      enum: ['UNMATCHED', 'MATCHED', 'AMBIGUOUS'],
      default: 'UNMATCHED',
    },
  },
  persistenceOptions,
);

resultImportRowSchema.index({ importId: 1 });
resultImportRowSchema.index({ registrationNumber: 1, subjectCode: 1 });

export const ResultImportRow = defineModel('ResultImportRow', resultImportRowSchema);
