import mongoose from 'mongoose';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
} from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const notificationSchema = new mongoose.Schema(
  {
    recipientUserId: { type: objectId, ref: 'User', required: true },
    type: { type: String, required: true, trim: true },
    sourceModule: { type: String, required: true, trim: true },
    sourceId: { type: String, trim: true },
    channel: { type: String, required: true, enum: NOTIFICATION_CHANNELS },
    status: {
      type: String,
      required: true,
      enum: NOTIFICATION_STATUSES,
      default: 'PENDING',
    },
    category: { type: String, enum: NOTIFICATION_CATEGORIES, default: 'system' },
    title: { type: String, trim: true, default: '' },
    body: { type: String, trim: true, default: '' },
    actionPath: { type: String, trim: true, default: '' },
    departmentId: { type: objectId, ref: 'Department' },
    priority: { type: String, enum: ['LOW', 'NORMAL', 'HIGH'], default: 'NORMAL' },
    mandatory: { type: Boolean, required: true, default: true },
    templateKey: { type: String, trim: true },
    locale: { type: String, trim: true, default: 'en' },
    scheduledAt: Date,
    deliveredAt: Date,
    failedAt: Date,
    failureCode: String,
    errorCategory: { type: String, trim: true },
    attemptCount: { type: Number, required: true, default: 0 },
    provider: { type: String, trim: true },
    providerMessageId: { type: String, trim: true },
    readAt: Date,
    reminderOffsetDays: { type: Number, enum: [7, 3, 1] },
    reminderOffsetHours: { type: Number },
    reminderGeneration: { type: Number, default: 0 },
    idempotencyKey: { type: String, required: true, trim: true },
  },
  persistenceOptions,
);

notificationSchema.index({ idempotencyKey: 1 }, { unique: true });
notificationSchema.index({ recipientUserId: 1, channel: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, channel: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, category: 1, createdAt: -1 });
notificationSchema.index({ channel: 1, status: 1, scheduledAt: 1 });
notificationSchema.index({ providerMessageId: 1 }, { sparse: true });

export const Notification = defineModel('Notification', notificationSchema);
