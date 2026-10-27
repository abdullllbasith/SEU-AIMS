import { Notification } from '../../notifications/index.js';
import { CalendarEvent, Notice } from '../../notices-calendar/index.js';
import { AuditEvent, listAuditEvents } from '../../audit-security/index.js';
import { runIntegrityChecks } from '../../audit-security/index.js';
import { queueSnapshot } from '../../../infrastructure/observability/health.service.js';
import { departmentObjectId, parsePage } from './scope.js';

export async function getNotificationHealth(principal) {
  const departmentId = departmentObjectId(principal);
  const grouped = await Notification.aggregate([
    { $match: { departmentId } },
    { $group: { _id: { status: '$status', channel: '$channel' }, count: { $sum: 1 } } },
  ]);
  const failed = await Notification.find({ departmentId, status: 'FAILED' })
    .sort({ failedAt: -1 })
    .limit(20)
    .select('type channel failureCode failedAt recipientUserId')
    .lean();

  return {
    byStatusAndChannel: grouped.map((row) => ({
      status: row._id.status,
      channel: row._id.channel,
      count: row.count,
    })),
    recentFailures: failed.map((row) => ({
      type: row.type,
      channel: row.channel,
      failureCode: row.failureCode || null,
      failedAt: row.failedAt || null,
      recipientUserId: String(row.recipientUserId),
    })),
    notes: [
      'Bodies and Study Room chat are omitted.',
      'FAILED is a delivery record status, not proof of provider outage.',
    ],
  };
}

export async function getCalendarHealth(principal) {
  const departmentId = departmentObjectId(principal);
  const now = new Date();
  const [upcomingPublished, cancelled, draftNotices, publishedNotices] = await Promise.all([
    CalendarEvent.countDocuments({
      departmentId,
      cancelledAt: null,
      publicationState: 'PUBLISHED',
      startsAt: { $gte: now },
    }),
    CalendarEvent.countDocuments({ departmentId, cancelledAt: { $ne: null } }),
    Notice.countDocuments({ departmentId, publicationState: 'DRAFT' }),
    Notice.countDocuments({ departmentId, publicationState: 'PUBLISHED' }),
  ]);
  return {
    upcomingPublishedEvents: upcomingPublished,
    cancelledEvents: cancelled,
    draftNotices,
    publishedNotices,
    notes: ['Calendar sync with an external provider is not implemented; these are in-app records.'],
  };
}

export async function getStorageHealth(principal) {
  departmentObjectId(principal);
  return {
    available: false,
    reason:
      'StoredFile has no departmentId. Department admins are not shown platform-wide file counts.',
  };
}

export async function getJobs(principal, { infrastructure } = {}) {
  departmentObjectId(principal);
  const queue = await queueSnapshot(infrastructure?.queue);
  return {
    queue,
    retry: {
      supported: false,
      reason:
        'Failed Redis list entries do not retain the original job payload. Re-run the domain action. Force-success is not offered.',
    },
    notes: ['There is no generic execute-job endpoint.'],
  };
}

export async function getAudit(principal, query = {}) {
  return listAuditEvents(principal, query);
}

export async function getDataQuality(principal) {
  return runIntegrityChecks(principal);
}

export async function getSecuritySignals(principal) {
  const departmentId = departmentObjectId(principal);
  const { page, pageSize } = parsePage({ page: 1, pageSize: 20 });
  const [denied, recentDenied] = await Promise.all([
    AuditEvent.countDocuments({ departmentId, result: 'DENIED' }),
    AuditEvent.find({ departmentId, result: 'DENIED' })
      .sort({ occurredAt: -1 })
      .limit(pageSize)
      .select('action entityType occurredAt actorRole reason')
      .lean(),
  ]);
  return {
    denied,
    page,
    pageSize,
    recentDenied: recentDenied.map((row) => ({
      action: row.action,
      entityType: row.entityType,
      occurredAt: row.occurredAt,
      actorRole: row.actorRole || null,
      reason: row.reason || null,
    })),
  };
}
