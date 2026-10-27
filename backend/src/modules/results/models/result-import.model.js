import mongoose from 'mongoose';
import { RESULT_IMPORT_STATUSES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const resultImportSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    fileId: { type: objectId, ref: 'StoredFile', required: true },
    uploadedByUserId: { type: objectId, ref: 'User', required: true },
    sourceType: { type: String, required: true, enum: ['PDF', 'XLSX'] },
    checksumSha256: { type: String, trim: true },
    originalFilename: { type: String, trim: true, default: '' },
    sizeBytes: { type: Number },
    parserVersion: { type: String, trim: true },
    processingAttempt: { type: Number, default: 1 },
    parseStartedAt: Date,
    parseFinishedAt: Date,
    sourceBatchId: { type: objectId, ref: 'Batch' },
    sourceAcademicYearId: { type: objectId, ref: 'AcademicYear' },
    sourceSemesterId: { type: objectId, ref: 'Semester' },
    resultPeriodsVersion: { type: Number, default: 0 },
    resultPeriods: {
      type: [
        {
          batchId: { type: objectId, ref: 'Batch' },
          batchCode: { type: String, trim: true, default: '' },
          batchName: { type: String, trim: true, default: '' },
          academicYearId: { type: objectId, ref: 'AcademicYear' },
          academicYearName: { type: String, trim: true, default: '' },
          academicYearSequence: { type: Number },
          semesterId: { type: objectId, ref: 'Semester' },
          semesterName: { type: String, trim: true, default: '' },
          semesterSequence: { type: Number },
        },
      ],
      default: undefined,
    },
    committingStartedAt: Date,
    commitToken: { type: String, trim: true },
    operationProgress: {
      completed: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    processingStatus: {
      type: String,
      required: true,
      enum: RESULT_IMPORT_STATUSES,
      default: 'UPLOADED',
    },
    summary: {
      totalRows: { type: Number, default: 0 },
      validRows: { type: Number, default: 0 },
      blockedRows: { type: Number, default: 0 },
      matchedStudents: { type: Number, default: 0 },
      unmatchedRows: { type: Number, default: 0 },
      ecaRows: { type: Number, default: 0 },
      updateRows: { type: Number, default: 0 },
      newRows: { type: Number, default: 0 },
      unchangedRows: { type: Number, default: 0 },
      conflictRows: { type: Number, default: 0 },
      duplicateRows: { type: Number, default: 0 },
    },
    duplicateOfImportId: { type: objectId, ref: 'ResultImport' },
    confirmedAt: Date,
    committedAt: Date,
    committedByUserId: { type: objectId, ref: 'User' },
    failedAt: Date,
    failureCode: String,
  },
  persistenceOptions,
);

resultImportSchema.index({ processingStatus: 1, createdAt: 1 });
resultImportSchema.index({ uploadedByUserId: 1 });
resultImportSchema.index({ departmentId: 1, checksumSha256: 1 });
resultImportSchema.index({ departmentId: 1, processingStatus: 1, createdAt: -1 });

export const ResultImport = defineModel('ResultImport', resultImportSchema);
