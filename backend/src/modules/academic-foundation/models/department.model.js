import mongoose from 'mongoose';
import { ENTITY_STATUSES } from '../constants.js';
import { defineModel, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const departmentSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    status: { type: String, required: true, enum: ENTITY_STATUSES, default: 'ACTIVE' },
  },
  persistenceOptions,
);

departmentSchema.index({ code: 1 }, { unique: true });
departmentSchema.index({ status: 1 });

export const Department = defineModel('Department', departmentSchema);
