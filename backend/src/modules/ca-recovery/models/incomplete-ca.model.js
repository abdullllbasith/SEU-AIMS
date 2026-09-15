import mongoose from 'mongoose';
import { INCOMPLETE_CA_STATUSES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const incompleteCaSchema = new mongoose.Schema(
  {
    studentUserId: { type: objectId, ref: 'User', required: true },
    registrationNumber: { type: String, required: true, trim: true, uppercase: true },
    subjectId: { type: objectId, ref: 'Subject', required: true },
    subjectCode: { type: String, required: true, trim: true, uppercase: true },
    academicYearId: { type: objectId, ref: 'AcademicYear', required: true },
    semesterId: { type: objectId, ref: 'Semester', required: true },
    academicResultId: { type: objectId, ref: 'AcademicResult', required: true },
    departmentId: { type: objectId, ref: 'Department' },
    status: { type: String, required: true, enum: INCOMPLETE_CA_STATUSES, default: 'OPEN' },
  },
  persistenceOptions,
);

incompleteCaSchema.index(
  { studentUserId: 1, subjectId: 1, academicYearId: 1, semesterId: 1 },
  { unique: true },
);
incompleteCaSchema.index({ academicResultId: 1 }, { unique: true });
incompleteCaSchema.index({ studentUserId: 1, status: 1 });

export const IncompleteCa = defineModel('IncompleteCa', incompleteCaSchema);
