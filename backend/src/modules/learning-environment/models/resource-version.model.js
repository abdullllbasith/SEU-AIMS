import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const resourceVersionSchema = new mongoose.Schema(
  {
    resourceId: { type: objectId, ref: 'OfficialResource', required: true },
    versionNumber: { type: Number, required: true },
    fileId: { type: objectId, ref: 'StoredFile', required: true },
    replacedByUserId: { type: objectId, ref: 'User', required: true },
  },
  persistenceOptions,
);

resourceVersionSchema.index({ resourceId: 1, versionNumber: 1 }, { unique: true });

export const ResourceVersion = defineModel('ResourceVersion', resourceVersionSchema);
