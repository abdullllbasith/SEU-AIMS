import mongoose from 'mongoose';
import { ENTITY_STATUSES, SPECIALIZATIONS } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const studentAcademicContextSchema = new mongoose.Schema(
  {
    userId: { type: objectId, ref: 'User', required: true },
    departmentId: { type: objectId, ref: 'Department', required: true },
    batchId: { type: objectId, ref: 'Batch', required: true },
    registrationNumber: { type: String, required: true, trim: true, uppercase: true },
    currentAcademicYearId: { type: objectId, ref: 'AcademicYear', required: true },
    currentSemesterId: { type: objectId, ref: 'Semester', required: true },
    specialization: { type: String, enum: [...SPECIALIZATIONS, null], default: null },
    status: { type: String, required: true, enum: ENTITY_STATUSES, default: 'ACTIVE' },
  },
  persistenceOptions,
);

studentAcademicContextSchema.index({ registrationNumber: 1 }, { unique: true });
studentAcademicContextSchema.index({ userId: 1 }, { unique: true });
studentAcademicContextSchema.index({ batchId: 1, currentAcademicYearId: 1, currentSemesterId: 1 });
studentAcademicContextSchema.index({ departmentId: 1, status: 1 });

export const StudentAcademicContext = defineModel(
  'StudentAcademicContext',
  studentAcademicContextSchema,
);
