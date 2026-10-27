import { randomUUID } from 'node:crypto';
import { currentCorrelationId, currentRequestId } from '../observability/request-context.js';

/**
 * Stable event envelope. This is not a transactional outbox.
 * Producers still own authoritative documents; consumers must reload from the owner.
 */
export function createDomainEvent({
  eventType,
  producer,
  entityType,
  entityId,
  payload = {},
  departmentId,
  actorId,
  version = 1,
}) {
  return {
    eventId: randomUUID(),
    eventType: String(eventType),
    occurredAt: new Date().toISOString(),
    producer: String(producer),
    version,
    correlationId: currentCorrelationId() || undefined,
    requestId: currentRequestId() || undefined,
    tenantId: departmentId ? String(departmentId) : undefined,
    actorId: actorId ? String(actorId) : undefined,
    entityType: String(entityType),
    entityId: String(entityId),
    payload,
  };
}
