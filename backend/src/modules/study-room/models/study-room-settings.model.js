import mongoose from 'mongoose';
import { MODERATION_MODES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const studyRoomSettingsSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    enabled: { type: Boolean, required: true, default: true },
    moderationMode: {
      type: String,
      required: true,
      enum: MODERATION_MODES,
      default: 'ADMIN_REVIEW',
    },
    updatedByUserId: { type: objectId, ref: 'User' },
  },
  persistenceOptions,
);

studyRoomSettingsSchema.index({ departmentId: 1 }, { unique: true });

export const StudyRoomSettings = defineModel('StudyRoomSettings', studyRoomSettingsSchema);
