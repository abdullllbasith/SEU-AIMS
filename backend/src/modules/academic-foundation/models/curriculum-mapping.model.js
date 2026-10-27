import mongoose from 'mongoose';
import { ENTITY_STATUSES, SPECIALIZATIONS } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const curriculumMappingSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    subjectId: { type: objectId, ref: 'Subject', required: true },
    academicYearId: { type: objectId, ref: 'AcademicYear', required: true },
    semesterId: { type: objectId, ref: 'Semester', required: true },
    specialization: { type: String, enum: [...SPECIALIZATIONS, null], default: null },
    status: { type: String, required: true, enum: ENTITY_STATUSES, default: 'ACTIVE' },
  },
  persistenceOptions,
);

curriculumMappingSchema.index(
  { departmentId: 1, subjectId: 1, academicYearId: 1, semesterId: 1, specialization: 1 },
  { unique: true, name: 'departmentId_1_subjectId_1_academicYearId_1_semesterId_1_specialization_1' },
);
curriculumMappingSchema.index({ departmentId: 1, academicYearId: 1, semesterId: 1, status: 1 });

export const CurriculumMapping = defineModel('CurriculumMapping', curriculumMappingSchema);
