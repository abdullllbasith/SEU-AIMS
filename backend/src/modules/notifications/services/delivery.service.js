import { Notification } from '../models/notification.model.js';
import { User } from '../../authentication/models/user.model.js';
import { MAX_DELIVERY_ATTEMPTS } from '../constants.js';
import { JOB_NAMES } from '../../../infrastructure/queue/job-names.js';

export function classifyProviderResult(result) {
  if (result?.accepted) {
    return { status: 'SENT', retryable: false, category: result.category || 'accepted' };
  }
  const category = result?.category || 'provider';
  const retryable = Boolean(result?.retryable);
  return { status: retryable ? 'RETRYING' : 'FAILED', retryable, category };
}

export async function processNotificationDeliver({ notificationId, infrastructure, logger }) {
  const doc = await Notification.findById(notificationId);
  if (!doc) {
    return { skipped: true, reason: 'MISSING' };
  }
  if (['SENT', 'DELIVERED', 'CANCELLED'].includes(doc.status)) {
    return { skipped: true, reason: 'ALREADY_FINAL' };
  }
  if (doc.channel === 'IN_APP') {
    doc.status = 'SENT';
    doc.deliveredAt = new Date();
    await doc.save();
    return { skipped: false, status: 'SENT' };
  }
  if (doc.scheduledAt && doc.scheduledAt > new Date()) {
    return { skipped: true, reason: 'TOO_EARLY' };
  }

  const user = await User.findById(doc.recipientUserId).select('email accountStatus whatsappNumber');
  if (!user || user.accountStatus !== 'ACTIVE') {
    doc.status = 'CANCELLED';
    doc.failureCode = 'recipient_inactive';
    doc.errorCategory = 'permanent';
    doc.failedAt = new Date();
    await doc.save();
    return { skipped: false, status: 'CANCELLED' };
  }

  doc.status = 'SENDING';
  doc.attemptCount += 1;
  await doc.save();

  let result;
  try {
    if (doc.channel === 'EMAIL') {
      result = await infrastructure.email.send({
        to: user.email,
        subject: doc.title || doc.type,
        body: doc.body || doc.title || doc.type,
      });
    } else if (doc.channel === 'WHATSAPP') {
      result = await infrastructure.whatsapp.send({
        to: user.whatsappNumber,
        body: doc.body || doc.title || doc.type,
      });
    } else {
      result = { accepted: false, retryable: false, category: 'unknown_channel' };
    }
  } catch (error) {
    logger?.warn('Notification provider threw', { channel: doc.channel, notificationId: String(doc._id) });
    result = { accepted: false, retryable: true, category: 'transient' };
  }

  const classified = classifyProviderResult(result);
  doc.provider = result?.provider;
  doc.providerMessageId = result?.providerMessageId;
  doc.errorCategory = classified.category;
  if (classified.status === 'SENT') {
    doc.status = 'SENT';
    doc.failedAt = undefined;
    await doc.save();
    return { skipped: false, status: 'SENT' };
  }

  if (classified.retryable && doc.attemptCount < MAX_DELIVERY_ATTEMPTS) {
    doc.status = 'RETRYING';
    doc.failureCode = classified.category;
    await doc.save();
    if (infrastructure.queue?.enqueue) {
      await infrastructure.queue.enqueue({
        name: JOB_NAMES.NOTIFICATION_DELIVER,
        payload: { notificationId: String(doc._id) },
        jobId: `notify.deliver:${doc._id}:${doc.attemptCount}`,
      });
    }
    return { skipped: false, status: 'RETRYING' };
  }

  doc.status = 'FAILED';
  doc.failureCode = classified.category;
  doc.failedAt = new Date();
  await doc.save();
  return { skipped: false, status: 'FAILED' };
}
