import mongoose from 'mongoose';
import { CRYPTO_PROTOCOL } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const cryptoPublicKeySchema = new mongoose.Schema(
  {
    userId: { type: objectId, ref: 'User', required: true },
    algorithm: { type: String, required: true, default: 'ECDH-P256' },
    protocolVersion: { type: String, required: true, default: CRYPTO_PROTOCOL },
    publicKeyJwk: { type: mongoose.Schema.Types.Mixed, required: true },
    recoveryPrivateJwk: { type: mongoose.Schema.Types.Mixed },
    keyVersion: { type: String, required: true, default: '1' },
  },
  persistenceOptions,
);

cryptoPublicKeySchema.index({ userId: 1 }, { unique: true });

export const CryptoPublicKey = defineModel('CryptoPublicKey', cryptoPublicKeySchema);
