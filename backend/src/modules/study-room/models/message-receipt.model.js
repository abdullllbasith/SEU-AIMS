import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const messageReceiptSchema = new mongoose.Schema(
  {
    conversationId: { type: objectId, ref: 'Conversation', required: true },
    userId: { type: objectId, ref: 'User', required: true },
    lastReadMessageId: { type: objectId, ref: 'Message' },
    lastReadAt: Date,
    // Per-user clear: this user no longer sees messages sent at or before this time.
    clearedAt: Date,
  },
  persistenceOptions,
);

messageReceiptSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

export const MessageReceipt = defineModel('MessageReceipt', messageReceiptSchema);
