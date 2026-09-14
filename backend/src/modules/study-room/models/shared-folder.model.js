import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const sharedFolderSchema = new mongoose.Schema(
  {
    createdByUserId: { type: objectId, ref: 'User', required: true },
    batchId: { type: objectId, ref: 'Batch' },
    name: { type: String, required: true, trim: true },
    visibility: { type: String, required: true, enum: ['COMMON', 'PUBLIC'] },
  },
  persistenceOptions,
);

sharedFolderSchema.index({ batchId: 1, visibility: 1 });

export const SharedFolder = defineModel('SharedFolder', sharedFolderSchema);
