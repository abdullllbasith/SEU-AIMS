import mongoose from 'mongoose';
import { ENTITY_STATUSES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const batchSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: ENTITY_STATUSES, default: 'ACTIVE' },
  },
  persistenceOptions,
);

batchSchema.index({ departmentId: 1, code: 1 }, { unique: true });
batchSchema.index({ departmentId: 1, status: 1 });

export const Batch = defineModel('Batch', batchSchema);
