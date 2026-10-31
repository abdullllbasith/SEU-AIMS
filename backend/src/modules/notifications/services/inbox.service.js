import { Notification } from '../models/notification.model.js';
import { ForbiddenError, NotFoundError } from '../../../shared/errors/app-error.js';
import { parsePagination, requireObjectId } from '../utils/http.js';

/** Future (not yet released) and cancelled/superseded notifications are not shown in the inbox. */
const HIDDEN_FROM_INBOX = ['SCHEDULED', 'CANCELLED'];

function mapInbox(doc) {
  return {
    id: String(doc._id),
    type: doc.type,
    category: doc.category,
    title: doc.title || doc.type,
    body: doc.body || '',
    actionPath: doc.actionPath || '',
    sourceModule: doc.sourceModule,
    sourceId: doc.sourceId || null,
    createdAt: doc.createdAt,
    readAt: doc.readAt || null,
    priority: doc.priority,
  };
}

export async function listInbox(principal, query = {}) {
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { recipientUserId: principal.userId, channel: 'IN_APP', status: { $nin: HIDDEN_FROM_INBOX } };
  if (query.category) {
    filter.category = String(query.category);
  }
  if (query.unread === 'true') {
    filter.readAt = null;
  }
  const [items, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
  ]);
  return { items: items.map(mapInbox), total, page, pageSize };
}

export async function unreadCount(principal) {
  const count = await Notification.countDocuments({
    recipientUserId: principal.userId,
    channel: 'IN_APP',
    status: { $nin: HIDDEN_FROM_INBOX },
    readAt: null,
  });
  return { count };
}

export async function markRead(principal, notificationId) {
  requireObjectId(notificationId, 'notification');
  const doc = await Notification.findById(notificationId);
  if (!doc || doc.channel !== 'IN_APP') {
    throw new NotFoundError('Notification not found');
  }
  if (String(doc.recipientUserId) !== String(principal.userId)) {
    throw new NotFoundError('Notification not found');
  }
  if (!doc.readAt) {
    doc.readAt = new Date();
    await doc.save();
  }
  return mapInbox(doc);
}

export async function markAllRead(principal) {
  const result = await Notification.updateMany(
    { recipientUserId: principal.userId, channel: 'IN_APP', status: { $nin: HIDDEN_FROM_INBOX }, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return { updated: result.modifiedCount };
}

export async function adminSummary(principal) {
  if (!principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
  const match = { departmentId: principal.departmentId };
  const [pending, failed, scheduled] = await Promise.all([
    Notification.countDocuments({ ...match, status: { $in: ['PENDING', 'QUEUED', 'RETRYING'] } }),
    Notification.countDocuments({ ...match, status: 'FAILED' }),
    Notification.countDocuments({ ...match, status: 'SCHEDULED' }),
  ]);
  const failures = await Notification.aggregate([
    { $match: { ...match, status: 'FAILED' } },
    { $group: { _id: '$errorCategory', count: { $sum: 1 } } },
  ]);
  return {
    pending,
    failed,
    scheduled,
    failureCategories: failures.map((row) => ({ category: row._id || 'unknown', count: row.count })),
  };
}
