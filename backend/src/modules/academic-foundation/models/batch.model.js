import mongoose from 'mongoose';
import { ENTITY_STATUSES, SPECIALIZATIONS } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const batchSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: ENTITY_STATUSES, default: 'ACTIVE' },
    // Optional on purpose. Existing batches stay unverified until an administrator assigns a period.
    currentAcademicYearId: { type: objectId, ref: 'AcademicYear', default: null },
    currentSemesterId: { type: objectId, ref: 'Semester', default: null },
    academicContextVerifiedAt: { type: Date, default: null },
    // Unset until an administrator chooses SWT or NST. Existing batches are not assigned one.
    specialization: { type: String, enum: [...SPECIALIZATIONS, null], default: null },
  },
  persistenceOptions,
);

batchSchema.index({ departmentId: 1, code: 1 }, { unique: true });
batchSchema.index({ departmentId: 1, status: 1 });

export const Batch = defineModel('Batch', batchSchema);
