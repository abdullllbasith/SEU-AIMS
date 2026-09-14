import mongoose from 'mongoose';
import { ENTITY_STATUSES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const subjectSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    credits: { type: Number, required: true, min: 0 },
    status: { type: String, required: true, enum: ENTITY_STATUSES, default: 'ACTIVE' },
  },
  persistenceOptions,
);

subjectSchema.index({ departmentId: 1, code: 1 }, { unique: true });
subjectSchema.index({ code: 1 });
subjectSchema.index({ departmentId: 1, status: 1 });

export const Subject = defineModel('Subject', subjectSchema);
