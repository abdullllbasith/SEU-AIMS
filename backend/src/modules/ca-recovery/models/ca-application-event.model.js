import mongoose from 'mongoose';
import { CA_APPLICATION_EVENT_TYPES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const caApplicationEventSchema = new mongoose.Schema(
  {
    applicationId: { type: objectId, ref: 'CaApplication', required: true },
    type: {
      type: String,
      required: true,
      enum: CA_APPLICATION_EVENT_TYPES,
    },
    actorUserId: { type: objectId, ref: 'User', required: true },
    fromStatus: String,
    toStatus: String,
    reason: { type: String, trim: true, default: '' },
    occurredAt: { type: Date, required: true, default: Date.now },
  },
  persistenceOptions,
);

caApplicationEventSchema.index({ applicationId: 1, occurredAt: 1 });

export const CaApplicationEvent = defineModel('CaApplicationEvent', caApplicationEventSchema);
