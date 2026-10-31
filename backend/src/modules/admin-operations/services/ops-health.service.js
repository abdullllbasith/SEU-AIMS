import { Notification } from '../../notifications/index.js';
import { CalendarEvent, Notice } from '../../notices-calendar/index.js';
import { AuditEvent, listAuditEvents } from '../../audit-security/index.js';
import { runIntegrityChecks } from '../../audit-security/index.js';
import { queueSnapshot } from '../../../infrastructure/observability/health.service.js';
import { ValidationError } from '../../../shared/errors/app-error.js';
import { departmentObjectId, parsePage } from './scope.js';

export async function getNotificationHealth(principal, { config } = {}) {
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
  // SMTP is configured by host + sender; any other non-noop vendor adapter by its API key.
  const emailConfigured = Boolean(
    config?.email?.provider === 'smtp'
      ? config.email.smtp?.host && config.email.from
      : config?.email?.provider && config.email.provider !== 'noop' && config.email.apiKey,
  );
  const whatsappConfigured = Boolean(config?.whatsapp?.phoneNumberId && config?.whatsapp?.accessToken);

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
    channels: {
      inApp: true,
      email: emailConfigured,
      whatsapp: whatsappConfigured,
    },
    notes: [
      'Bodies and Study Room chat are omitted.',
      'FAILED is a delivery record status, not proof of provider outage.',
      emailConfigured
        ? 'Email delivery is configured.'
        : 'Email is not configured. Notices stay in the app until EMAIL_PROVIDER=smtp with SMTP_HOST and EMAIL_FROM are set.',
      whatsappConfigured
        ? 'WhatsApp delivery is configured.'
        : 'WhatsApp is not configured. Notices stay in the app until the Cloud API phone id and token are set.',
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
  const failed = infrastructure?.queue?.listFailed ? await infrastructure.queue.listFailed(20) : [];
  return {
    queue,
    failed,
    retry: {
      supported: typeof infrastructure?.queue?.retryFailed === 'function',
      reason:
        'Retry puts a saved failed job back on the queue. Jobs that failed before the payload was saved cannot be retried. Force-success is not offered. An in-memory queue still drops jobs when the API process stops; Redis keeps them.',
    },
    notes: ['There is no generic execute-job endpoint.'],
  };
}

export async function retryFailedJob(principal, jobId, { infrastructure } = {}) {
  departmentObjectId(principal);
  if (!jobId || !infrastructure?.queue?.retryFailed) {
    throw new ValidationError('Job retry is not available');
  }
  const retried = await infrastructure.queue.retryFailed(String(jobId));
  if (!retried) {
    throw new ValidationError('This failed job cannot be retried. Run the original action again.');
  }
  return retried;
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
