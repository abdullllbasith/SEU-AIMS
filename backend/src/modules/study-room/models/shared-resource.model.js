import mongoose from 'mongoose';
import { RESOURCE_STATES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const sharedResourceSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    batchId: { type: objectId, ref: 'Batch', required: true },
    folderId: { type: objectId, ref: 'SharedFolder', required: true },
    fileId: { type: objectId, ref: 'StoredFile', required: true },
    createdByUserId: { type: objectId, ref: 'User', required: true },
    title: { type: String, trim: true, maxlength: 180, default: '' },
    moderationState: {
      type: String,
      required: true,
      enum: RESOURCE_STATES,
      default: 'SCANNING',
    },
    reviewStatus: {
      type: String,
      enum: ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    deletedAt: Date,
    duplicateOfResourceId: { type: objectId, ref: 'SharedResource' },
  },
  persistenceOptions,
);

sharedResourceSchema.index({ folderId: 1, moderationState: 1, createdAt: 1 });
sharedResourceSchema.index({ departmentId: 1, moderationState: 1 });
sharedResourceSchema.index({ fileId: 1 });

export const SharedResource = defineModel('SharedResource', sharedResourceSchema);
