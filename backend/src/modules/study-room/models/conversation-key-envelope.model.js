import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const conversationKeyEnvelopeSchema = new mongoose.Schema(
  {
    conversationId: { type: objectId, ref: 'Conversation', required: true },
    recipientUserId: { type: objectId, ref: 'User', required: true },
    wrappedByUserId: { type: objectId, ref: 'User', required: true },
    keyVersion: { type: String, required: true, trim: true },
    wrappedKey: { type: String, required: true },
    nonce: { type: String, required: true },
  },
  persistenceOptions,
);

conversationKeyEnvelopeSchema.index(
  { conversationId: 1, recipientUserId: 1, keyVersion: 1 },
  { unique: true },
);

export const ConversationKeyEnvelope = defineModel(
  'ConversationKeyEnvelope',
  conversationKeyEnvelopeSchema,
);
