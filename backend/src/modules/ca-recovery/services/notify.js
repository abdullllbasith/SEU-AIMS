import { fanoutNotification } from '../../notifications/index.js';
import { recordAudit as persistAudit } from '../../audit-security/services/record-audit.service.js';

export async function recordCaAudit({ actorUserId, action, entityType, entityId, metadata, departmentId }) {
  await persistAudit({
    actorUserId,
    action,
    entityType,
    entityId,
    metadata,
    departmentId,
  });
}

export async function emitCaNotification({
  recipientUserId,
  type,
  sourceId,
  reminderOffsetDays,
  reminderGeneration,
  scheduledAt,
  infrastructure,
  departmentId,
  vars,
  channels,
  actionPath = '/ca',
  templateParams,
  guardRef,
}) {
  await fanoutNotification({
    recipientUserId,
    type,
    sourceModule: 'ca-recovery',
    sourceId,
    reminderOffsetDays,
    reminderGeneration,
    scheduledAt,
    actionPath,
    departmentId,
    infrastructure,
    vars,
    channels,
    templateParams,
    guardRef,
  });
}
