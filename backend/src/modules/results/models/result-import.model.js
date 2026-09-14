import mongoose from 'mongoose';
import { RESULT_IMPORT_STATUSES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const resultImportSchema = new mongoose.Schema(
  {
    fileId: { type: objectId, ref: 'StoredFile', required: true },
    uploadedByUserId: { type: objectId, ref: 'User', required: true },
    sourceBatchId: { type: objectId, ref: 'Batch' },
    sourceAcademicYearId: { type: objectId, ref: 'AcademicYear' },
    sourceSemesterId: { type: objectId, ref: 'Semester' },
    processingStatus: {
      type: String,
      required: true,
      enum: RESULT_IMPORT_STATUSES,
      default: 'UPLOADED',
    },
    confirmedAt: Date,
    committedAt: Date,
    failedAt: Date,
    failureCode: String,
  },
  persistenceOptions,
);

resultImportSchema.index({ processingStatus: 1, createdAt: 1 });
resultImportSchema.index({ uploadedByUserId: 1 });

export const ResultImport = defineModel('ResultImport', resultImportSchema);
