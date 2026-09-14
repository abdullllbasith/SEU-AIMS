import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: objectId, ref: 'Conversation', required: true },
    senderUserId: { type: objectId, ref: 'User', required: true },
    encryptedPayload: {
      ciphertext: { type: String, required: true },
      nonce: { type: String, required: true },
      keyVersion: { type: String, required: true },
    },
    sentAt: { type: Date, required: true, default: Date.now },
  },
  persistenceOptions,
);

messageSchema.index({ conversationId: 1, sentAt: 1 });

export const Message = defineModel('Message', messageSchema);
