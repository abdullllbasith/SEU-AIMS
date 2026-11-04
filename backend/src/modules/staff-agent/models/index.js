import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';
import { AGENT_KINDS } from '../constants.js';

/** One row per staff member, agent and day. Counts requests and tokens only; no message text is stored. */
const staffAgentUsageSchema = new mongoose.Schema(
  {
    userId: { type: objectId, ref: 'User', required: true },
    agent: { type: String, required: true, enum: AGENT_KINDS },
    day: { type: String, required: true },
    requests: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
  },
  persistenceOptions,
);
staffAgentUsageSchema.index({ userId: 1, agent: 1, day: 1 }, { unique: true });

export const StaffAgentUsage = defineModel('StaffAgentUsage', staffAgentUsageSchema);
