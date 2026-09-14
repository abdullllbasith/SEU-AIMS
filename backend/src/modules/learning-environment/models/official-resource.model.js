import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const officialResourceSchema = new mongoose.Schema(
  {
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering', required: true },
    createdByUserId: { type: objectId, ref: 'User', required: true },
    fileId: { type: objectId, ref: 'StoredFile', required: true },
    title: { type: String, required: true, trim: true },
    publicationState: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'UNPUBLISHED'],
      default: 'DRAFT',
    },
  },
  persistenceOptions,
);

officialResourceSchema.index({ subjectOfferingId: 1, publicationState: 1 });
officialResourceSchema.index({ createdByUserId: 1 });

export const OfficialResource = defineModel('OfficialResource', officialResourceSchema);
