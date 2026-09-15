import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const AUDIT_CATEGORIES = Object.freeze([
  'authentication',
  'authorization',
  'academic',
  'ca_recovery',
  'communication',
  'files',
  'study_room',
  'results',
  'security',
  'system',
]);

const auditEventSchema = new mongoose.Schema(
  {
    actorUserId: { type: objectId, ref: 'User' },
    actorRole: { type: String, trim: true },
    departmentId: { type: objectId, ref: 'Department' },
    action: { type: String, required: true, trim: true },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: String, required: true, trim: true },
    sourceModule: { type: String, trim: true },
    category: { type: String, enum: AUDIT_CATEGORIES, default: 'system' },
    result: { type: String, enum: ['SUCCESS', 'DENIED', 'FAILED'], default: 'SUCCESS' },
    reason: { type: String, trim: true },
    correlationId: { type: String, trim: true },
    requestId: { type: String, trim: true },
    ipHash: { type: String, trim: true },
    userAgentSummary: { type: String, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
    occurredAt: { type: Date, required: true, default: Date.now },
  },
  persistenceOptions,
);

auditEventSchema.index({ entityType: 1, entityId: 1, occurredAt: 1 });
auditEventSchema.index({ actorUserId: 1, occurredAt: 1 });
auditEventSchema.index({ action: 1, occurredAt: 1 });
auditEventSchema.index({ departmentId: 1, occurredAt: -1 });
auditEventSchema.index({ correlationId: 1, occurredAt: -1 });
auditEventSchema.index({ category: 1, occurredAt: -1 });

function rejectMutation() {
  throw new Error('Audit records are append-only');
}

auditEventSchema.pre('save', function rejectUpdates() {
  if (!this.isNew) {
    rejectMutation();
  }
});
auditEventSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'], rejectMutation);

export const AuditEvent = defineModel('AuditEvent', auditEventSchema);
export { AUDIT_CATEGORIES };
