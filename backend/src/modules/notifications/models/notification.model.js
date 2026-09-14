import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const notificationSchema = new mongoose.Schema(
  {
    recipientUserId: { type: objectId, ref: 'User', required: true },
    type: { type: String, required: true, trim: true },
    sourceModule: { type: String, required: true, trim: true },
    sourceId: { type: String, trim: true },
    channel: { type: String, required: true, enum: ['IN_APP', 'EMAIL', 'WHATSAPP'] },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'SCHEDULED', 'SENT', 'FAILED'],
      default: 'PENDING',
    },
    scheduledAt: Date,
    deliveredAt: Date,
    failedAt: Date,
    failureCode: String,
    reminderOffsetDays: { type: Number, enum: [7, 3, 1] },
    idempotencyKey: { type: String, required: true, trim: true },
  },
  persistenceOptions,
);

notificationSchema.index({ idempotencyKey: 1 }, { unique: true });
notificationSchema.index({ recipientUserId: 1, status: 1, createdAt: 1 });
notificationSchema.index({ channel: 1, status: 1, scheduledAt: 1 });

export const Notification = defineModel('Notification', notificationSchema);
