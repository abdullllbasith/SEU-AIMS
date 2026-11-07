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
    /**
     * Course terms. All optional and unused by GPA until a later flag is approved.
     * GPA eligibility stays on Subject.countsForGpa. These facts are kept apart on purpose:
     * GPA credits, earned credits and degree credits are different numbers.
     */
    courseRole: { type: String, enum: ['CORE', 'ELECTIVE', 'ELECTIVE_PRACTICAL', null], default: null },
    electiveGroupId: { type: String, trim: true, default: null },
    pairsWithSubjectId: { type: objectId, ref: 'Subject', default: null },
    gradingMode: { type: String, enum: ['GRADED', 'PASS_FAIL', null], default: null },
    /** true, false, or null when unconfirmed. The handbook extract lists no auxiliary courses. */
    isAuxiliary: { type: Boolean, default: null },
    degreeCreditEligible: { type: Boolean, default: null },
    degreeCredits: { type: Number, min: 0, default: null },
  },
  persistenceOptions,
);

curriculumMappingSchema.index(
  { departmentId: 1, subjectId: 1, academicYearId: 1, semesterId: 1, specialization: 1 },
  { unique: true, name: 'departmentId_1_subjectId_1_academicYearId_1_semesterId_1_specialization_1' },
);
curriculumMappingSchema.index({ departmentId: 1, academicYearId: 1, semesterId: 1, status: 1 });

export const CurriculumMapping = defineModel('CurriculumMapping', curriculumMappingSchema);
