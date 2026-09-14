import mongoose from 'mongoose';
import { SEMESTER_SEQUENCE, ENTITY_STATUSES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const semesterSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    academicYearId: { type: objectId, ref: 'AcademicYear', required: true },
    sequence: { type: Number, required: true, enum: SEMESTER_SEQUENCE },
    name: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: ENTITY_STATUSES, default: 'ACTIVE' },
  },
  persistenceOptions,
);

semesterSchema.index({ academicYearId: 1, sequence: 1 }, { unique: true });
semesterSchema.index({ departmentId: 1, status: 1 });

export const Semester = defineModel('Semester', semesterSchema);
