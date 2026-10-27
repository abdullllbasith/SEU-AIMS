import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const notificationPreferenceSchema = new mongoose.Schema(
  {
    userId: { type: objectId, ref: 'User', required: true },
    locale: { type: String, trim: true, default: 'en' },
    emailEnabled: { type: Boolean, required: true, default: true },
    whatsappEnabled: { type: Boolean, required: true, default: true },
    inAppEnabled: { type: Boolean, required: true, default: true },
  },
  persistenceOptions,
);

notificationPreferenceSchema.index({ userId: 1 }, { unique: true });

export const NotificationPreference = defineModel('NotificationPreference', notificationPreferenceSchema);
