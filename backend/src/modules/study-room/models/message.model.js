import mongoose from 'mongoose';
import { CRYPTO_PROTOCOL } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: objectId, ref: 'Conversation', required: true },
    senderUserId: { type: objectId, ref: 'User', required: true },
    clientMessageId: { type: String, required: true, trim: true },
    encryptedPayload: {
      ciphertext: { type: String, required: true },
      nonce: { type: String, required: true },
      keyVersion: { type: String, required: true },
      protocolVersion: { type: String, required: true, default: CRYPTO_PROTOCOL },
    },
    sharedResourceId: { type: objectId, ref: 'SharedResource' },
    deletedAt: Date,
    editedAt: Date,
    sentAt: { type: Date, required: true, default: Date.now },
  },
  persistenceOptions,
);

messageSchema.index({ conversationId: 1, sentAt: 1, _id: 1 });
messageSchema.index(
  { conversationId: 1, senderUserId: 1, clientMessageId: 1 },
  { unique: true },
);

export const Message = defineModel('Message', messageSchema);
