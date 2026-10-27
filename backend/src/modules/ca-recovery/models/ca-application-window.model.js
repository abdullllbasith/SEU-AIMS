import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const caApplicationWindowSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    academicYearId: { type: objectId, ref: 'AcademicYear', required: true },
    semesterId: { type: objectId, ref: 'Semester', required: true },
    opensAt: { type: Date, required: true },
    closesAt: { type: Date, required: true },
    published: { type: Boolean, required: true, default: false },
    suspended: { type: Boolean, required: true, default: false },
  },
  persistenceOptions,
);

caApplicationWindowSchema.index(
  { departmentId: 1, academicYearId: 1, semesterId: 1 },
  { unique: true },
);
caApplicationWindowSchema.index({ departmentId: 1, published: 1, opensAt: 1 });

export const CaApplicationWindow = defineModel('CaApplicationWindow', caApplicationWindowSchema);
