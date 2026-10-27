import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const authSessionSchema = new mongoose.Schema(
  {
    userId: { type: objectId, ref: 'User', required: true },
    familyId: { type: String, required: true, trim: true },
    refreshTokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    replacedByHash: String,
    userAgent: String,
    ip: String,
  },
  persistenceOptions,
);

authSessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
authSessionSchema.index({ userId: 1, familyId: 1 });
authSessionSchema.index({ expiresAt: 1 });

export const AuthSession = defineModel('AuthSession', authSessionSchema);
