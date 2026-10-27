import mongoose from 'mongoose';
import { ACADEMIC_YEAR_SEQUENCE, ENTITY_STATUSES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const academicYearSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    sequence: { type: Number, required: true, enum: ACADEMIC_YEAR_SEQUENCE },
    name: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: ENTITY_STATUSES, default: 'ACTIVE' },
  },
  persistenceOptions,
);

academicYearSchema.index({ departmentId: 1, sequence: 1 }, { unique: true });
academicYearSchema.index({ departmentId: 1, status: 1 });

export const AcademicYear = defineModel('AcademicYear', academicYearSchema);
