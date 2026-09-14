import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, enum: ['BATCH', 'PRIVATE'] },
    batchId: { type: objectId, ref: 'Batch' },
    participantUserIds: [{ type: objectId, ref: 'User' }],
    participantKey: { type: String, trim: true },
  },
  persistenceOptions,
);

conversationSchema.index({ type: 1, batchId: 1 }, { unique: true, sparse: true });
conversationSchema.index({ participantKey: 1 }, { unique: true, sparse: true });

export const Conversation = defineModel('Conversation', conversationSchema);
