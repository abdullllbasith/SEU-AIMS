import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const auditEventSchema = new mongoose.Schema(
  {
    actorUserId: { type: objectId, ref: 'User' },
    action: { type: String, required: true, trim: true },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: String, required: true, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
    occurredAt: { type: Date, required: true, default: Date.now },
  },
  persistenceOptions,
);

auditEventSchema.index({ entityType: 1, entityId: 1, occurredAt: 1 });
auditEventSchema.index({ actorUserId: 1, occurredAt: 1 });
auditEventSchema.index({ action: 1, occurredAt: 1 });

export const AuditEvent = defineModel('AuditEvent', auditEventSchema);
