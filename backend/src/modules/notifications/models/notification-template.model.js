import mongoose from 'mongoose';
import { NOTIFICATION_CHANNELS, SUPPORTED_LOCALES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const notificationTemplateSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department' },
    templateKey: { type: String, required: true, trim: true },
    eventType: { type: String, required: true, trim: true },
    channel: { type: String, required: true, enum: NOTIFICATION_CHANNELS },
    locale: { type: String, required: true, enum: [...SUPPORTED_LOCALES], default: 'en' },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    version: { type: Number, required: true, default: 1 },
    active: { type: Boolean, required: true, default: true },
  },
  persistenceOptions,
);

notificationTemplateSchema.index(
  { templateKey: 1, channel: 1, locale: 1, departmentId: 1 },
  { unique: true },
);

export const NotificationTemplate = defineModel('NotificationTemplate', notificationTemplateSchema);
