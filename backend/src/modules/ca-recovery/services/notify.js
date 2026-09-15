import { fanoutNotification } from '../../notifications/index.js';
import { AuditEvent } from '../../audit-security/index.js';

export async function recordCaAudit({ actorUserId, action, entityType, entityId, metadata }) {
  await AuditEvent.create({
    actorUserId,
    action,
    entityType,
    entityId: String(entityId),
    metadata,
    occurredAt: new Date(),
  });
}

export async function emitCaNotification({
  recipientUserId,
  type,
  sourceId,
  reminderOffsetDays,
  scheduledAt,
  infrastructure,
  departmentId,
}) {
  await fanoutNotification({
    recipientUserId,
    type,
    sourceModule: 'ca-recovery',
    sourceId,
    reminderOffsetDays,
    scheduledAt,
    actionPath: '/ca',
    departmentId,
    infrastructure,
  });
}
