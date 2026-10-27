import mongoose from 'mongoose';
import { FOLDER_VISIBILITY } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const sharedFolderSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    batchId: { type: objectId, ref: 'Batch', required: true },
    createdByUserId: { type: objectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    visibility: { type: String, required: true, enum: FOLDER_VISIBILITY, default: 'COMMON' },
    status: { type: String, required: true, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
    deletedAt: Date,
  },
  persistenceOptions,
);

sharedFolderSchema.index({ batchId: 1, deletedAt: 1, createdAt: 1 });
sharedFolderSchema.index({ departmentId: 1, batchId: 1 });

export const SharedFolder = defineModel('SharedFolder', sharedFolderSchema);
