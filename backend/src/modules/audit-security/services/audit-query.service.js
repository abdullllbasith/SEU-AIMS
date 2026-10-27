import { AuditEvent } from '../models/audit-event.model.js';
import { mapAudit } from './record-audit.service.js';
import { ForbiddenError, ValidationError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { snapshotMetrics } from '../../../infrastructure/observability/metrics.js';
import { queueSnapshot } from '../../../infrastructure/observability/health.service.js';

function assertAdmin(principal) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
}

export async function listAuditEvents(principal, query = {}) {
  assertAdmin(principal);
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  const filter = { departmentId: principal.departmentId };
  if (query.category) {
    filter.category = String(query.category);
  }
  if (query.action) {
    filter.action = String(query.action);
  }
  const [items, total] = await Promise.all([
    AuditEvent.find(filter)
      .sort({ occurredAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select('-ipHash'),
    AuditEvent.countDocuments(filter),
  ]);
  return { items: items.map(mapAudit), total, page, pageSize };
}

export async function auditSummary(principal) {
  assertAdmin(principal);
  const match = { departmentId: principal.departmentId };
  const [byCategory, denied] = await Promise.all([
    AuditEvent.aggregate([{ $match: match }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
    AuditEvent.countDocuments({ ...match, result: 'DENIED' }),
  ]);
  return {
    denied,
    categories: byCategory.map((row) => ({ category: row._id || 'system', count: row.count })),
  };
}

export async function operationalSnapshot(principal, { infrastructure } = {}) {
  assertAdmin(principal);
  return {
    metrics: snapshotMetrics(),
    queue: await queueSnapshot(infrastructure?.queue),
    providers: {
      email: infrastructure?.email ? 'present' : 'missing',
      whatsapp: infrastructure?.whatsapp ? 'present' : 'missing',
      malwareScanner: infrastructure?.malwareScanner ? 'present' : 'missing',
    },
  };
}

export function rejectAuditMutation() {
  throw new ValidationError('Audit records cannot be edited or deleted');
}
