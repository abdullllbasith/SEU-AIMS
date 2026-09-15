import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const academicResultSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    studentUserId: { type: objectId, ref: 'User', required: true },
    registrationNumber: { type: String, required: true, trim: true, uppercase: true },
    subjectId: { type: objectId, ref: 'Subject', required: true },
    subjectCode: { type: String, required: true, trim: true, uppercase: true },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering' },
    studentAcademicYearId: { type: objectId, ref: 'AcademicYear', required: true },
    studentSemesterId: { type: objectId, ref: 'Semester', required: true },
    sourceImportId: { type: objectId, ref: 'ResultImport' },
    sourceBatchId: { type: objectId, ref: 'Batch' },
    resultCode: { type: String, required: true, trim: true },
    previousResultCode: { type: String, trim: true },
    version: { type: Number, required: true, default: 1 },
    isEca: { type: Boolean, required: true, default: false },
    committedByUserId: { type: objectId, ref: 'User' },
  },
  persistenceOptions,
);

academicResultSchema.index({ registrationNumber: 1, subjectCode: 1 }, { unique: true });
academicResultSchema.index({ studentUserId: 1, studentAcademicYearId: 1, studentSemesterId: 1 });
academicResultSchema.index({ subjectCode: 1 });
academicResultSchema.index({ departmentId: 1, studentUserId: 1 });

export const AcademicResult = defineModel('AcademicResult', academicResultSchema);
