import { createHash } from 'node:crypto';
import { AuditEvent } from '../models/audit-event.model.js';
import { currentCorrelationId, currentRequestId } from '../../../infrastructure/observability/request-context.js';

function hashIp(value) {
  if (!value) {
    return undefined;
  }
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function classifyAction(action) {
  const name = String(action || '');
  if (name.startsWith('auth.')) {
    return 'authentication';
  }
  if (name.includes('denied') || name.startsWith('security.')) {
    return 'authorization';
  }
  if (name.startsWith('ca.') || name.includes('ca.')) {
    return 'ca_recovery';
  }
  if (name.startsWith('notice.') || name.startsWith('calendar.') || name.startsWith('notification.')) {
    return 'communication';
  }
  if (name.startsWith('academic.')) {
    return 'academic';
  }
  if (name.includes('result') || name.startsWith('results.')) {
    return 'results';
  }
  if (name.startsWith('study-room') || name.includes('moderation')) {
    return 'study_room';
  }
  if (name.includes('file') || name.includes('scan') || name.includes('photo')) {
    return 'files';
  }
  return 'system';
}

export async function recordAudit(input = {}) {
  const {
    actorUserId,
    actorRole,
    departmentId,
    action,
    entityType,
    entityId,
    sourceModule,
    result = 'SUCCESS',
    reason,
    metadata,
    occurredAt,
    ip,
    userAgent,
  } = input;

  return AuditEvent.create({
    actorUserId,
    actorRole,
    departmentId,
    action,
    entityType,
    entityId: String(entityId),
    sourceModule,
    category: classifyAction(action),
    result,
    reason,
    correlationId: currentCorrelationId() || undefined,
    requestId: currentRequestId() || undefined,
    ipHash: hashIp(ip),
    userAgentSummary: userAgent ? String(userAgent).slice(0, 120) : undefined,
    metadata,
    occurredAt: occurredAt || new Date(),
  });
}

export function mapAudit(doc) {
  return {
    id: String(doc._id),
    action: doc.action,
    entityType: doc.entityType,
    entityId: doc.entityId,
    actorRole: doc.actorRole || null,
    departmentId: doc.departmentId ? String(doc.departmentId) : null,
    sourceModule: doc.sourceModule || null,
    category: doc.category,
    result: doc.result,
    reason: doc.reason || null,
    correlationId: doc.correlationId || null,
    requestId: doc.requestId || null,
    occurredAt: doc.occurredAt,
    metadata: doc.metadata || {},
  };
}
