import mongoose from 'mongoose';
import { CRYPTO_PROTOCOL, CONVERSATION_TYPES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, enum: CONVERSATION_TYPES },
    departmentId: { type: objectId, ref: 'Department', required: true },
    batchId: { type: objectId, ref: 'Batch' },
    participantUserIds: [{ type: objectId, ref: 'User' }],
    participantKey: { type: String, trim: true },
    cryptoProtocol: { type: String, required: true, default: CRYPTO_PROTOCOL },
    currentKeyVersion: { type: String, trim: true, default: '1' },
    status: { type: String, required: true, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
    lastMessageAt: Date,
    createdByUserId: { type: objectId, ref: 'User' },
  },
  persistenceOptions,
);

conversationSchema.index({ type: 1, batchId: 1 }, { unique: true, sparse: true });
conversationSchema.index({ participantKey: 1 }, { unique: true, sparse: true });
conversationSchema.index({ departmentId: 1, type: 1 });

export const Conversation = defineModel('Conversation', conversationSchema);
