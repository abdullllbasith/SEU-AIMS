import mongoose from 'mongoose';
import { ENTITY_STATUSES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const subjectOfferingSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    subjectId: { type: objectId, ref: 'Subject', required: true },
    batchId: { type: objectId, ref: 'Batch', required: true },
    academicYearId: { type: objectId, ref: 'AcademicYear', required: true },
    semesterId: { type: objectId, ref: 'Semester', required: true },
    status: { type: String, required: true, enum: ENTITY_STATUSES, default: 'ACTIVE' },
  },
  persistenceOptions,
);

subjectOfferingSchema.index(
  { subjectId: 1, batchId: 1, academicYearId: 1, semesterId: 1 },
  { unique: true },
);
subjectOfferingSchema.index({ batchId: 1, academicYearId: 1, semesterId: 1 });
subjectOfferingSchema.index({ subjectId: 1 });
subjectOfferingSchema.index({ departmentId: 1, status: 1 });

export const SubjectOffering = defineModel('SubjectOffering', subjectOfferingSchema);
