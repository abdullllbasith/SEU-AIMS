import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const studentAcademicHistorySchema = new mongoose.Schema(
  {
    studentAcademicContextId: { type: objectId, ref: 'StudentAcademicContext', required: true },
    userId: { type: objectId, ref: 'User', required: true },
    academicYearId: { type: objectId, ref: 'AcademicYear', required: true },
    semesterId: { type: objectId, ref: 'Semester', required: true },
    recordedAt: { type: Date, required: true, default: Date.now },
  },
  persistenceOptions,
);

studentAcademicHistorySchema.index(
  { studentAcademicContextId: 1, academicYearId: 1, semesterId: 1 },
  { unique: true },
);
studentAcademicHistorySchema.index({ userId: 1, academicYearId: 1, semesterId: 1 });

export const StudentAcademicHistory = defineModel(
  'StudentAcademicHistory',
  studentAcademicHistorySchema,
);
