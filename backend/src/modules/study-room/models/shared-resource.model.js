import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const sharedResourceSchema = new mongoose.Schema(
  {
    folderId: { type: objectId, ref: 'SharedFolder', required: true },
    fileId: { type: objectId, ref: 'StoredFile', required: true },
    createdByUserId: { type: objectId, ref: 'User', required: true },
    reviewStatus: {
      type: String,
      enum: ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
  },
  persistenceOptions,
);

sharedResourceSchema.index({ folderId: 1, reviewStatus: 1 });

export const SharedResource = defineModel('SharedResource', sharedResourceSchema);
