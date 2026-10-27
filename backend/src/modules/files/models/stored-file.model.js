import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

export const FILE_OWNING_DOMAINS = Object.freeze([
  'OFFICIAL_RESOURCE',
  'STUDY_ROOM_RESOURCE',
  'RESULT_IMPORT',
  'CA_APPLICATION_PDF',
  'PROFILE_IMAGE',
  'NOTICE_IMAGE',
]);

const storedFileSchema = new mongoose.Schema(
  {
    storageKey: { type: String, required: true, trim: true },
    originalFilename: { type: String, required: true },
    displayFilename: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    uploadedByUserId: { type: objectId, ref: 'User', required: true },
    owningDomain: { type: String, required: true, enum: FILE_OWNING_DOMAINS },
    owningContextId: { type: objectId, required: true },
    scanStatus: {
      type: String,
      required: true,
      enum: ['UPLOADED', 'QUARANTINED', 'SCANNING', 'SAFE', 'UNSAFE', 'REJECTED'],
      default: 'UPLOADED',
    },
    reviewStatus: {
      type: String,
      required: true,
      enum: ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'],
      default: 'NOT_REQUIRED',
    },
    availability: {
      type: String,
      required: true,
      enum: ['UNAVAILABLE', 'AVAILABLE'],
      default: 'UNAVAILABLE',
    },
    checksumSha256: { type: String, trim: true },
  },
  persistenceOptions,
);

storedFileSchema.index({ storageKey: 1 }, { unique: true });
storedFileSchema.index({ owningDomain: 1, owningContextId: 1 });
storedFileSchema.index({ scanStatus: 1, reviewStatus: 1 });

export const StoredFile = defineModel('StoredFile', storedFileSchema);
