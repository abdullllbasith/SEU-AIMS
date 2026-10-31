import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { Notification } from '../models/notification.model.js';
import { User } from '../../authentication/models/user.model.js';
import { MAX_DELIVERY_ATTEMPTS } from '../constants.js';
import { runNotificationGuard } from './guards.js';
import { resolveWhatsAppMessage } from './whatsapp-policy.js';

const DEFAULT_LEASE_MS = 120_000;
const FINAL_STATUSES = ['SENT', 'DELIVERED', 'CANCELLED', 'FAILED'];

export const DEFAULT_WORKER_ID = `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

export function classifyProviderResult(result) {
  if (result?.accepted) {
    return { status: 'SENT', retryable: false, category: result.category || 'accepted' };
  }
  const category = result?.category || 'provider';
  const retryable = Boolean(result?.retryable);
  return { status: retryable ? 'RETRYING' : 'FAILED', retryable, category };
}

/** Exponential backoff: 1, 2, 4, 8 ... minutes, capped at 30 minutes. */
export function backoffMs(attemptCount) {
  const exponent = Math.max(0, Number(attemptCount) - 1);
  return Math.min(60_000 * 2 ** exponent, 30 * 60_000);
}

const releaseLease = { leaseOwner: '', leaseExpiresAt: '' };

/** Write the outcome only if this worker still holds the lease. Returns the updated document or null. */
function finishClaimed(doc, workerId, set, extraUnset = {}) {
  return Notification.findOneAndUpdate(
    { _id: doc._id, leaseOwner: workerId, status: 'SENDING' },
    { $set: set, $unset: { ...releaseLease, ...extraUnset } },
    { new: true },
  );
}

async function explainNotClaimed(notificationId, now) {
  const current = await Notification.findById(notificationId).select('status scheduledAt channel');
  if (!current) {
    return { skipped: true, reason: 'MISSING' };
  }
  if (FINAL_STATUSES.includes(current.status)) {
    return { skipped: true, reason: 'ALREADY_FINAL' };
  }
  if (current.status === 'SCHEDULED' || (current.scheduledAt && current.scheduledAt > now)) {
    return { skipped: true, reason: 'TOO_EARLY' };
  }
  return { skipped: true, reason: 'NOT_CLAIMED' };
}

export async function processNotificationDeliver({
  notificationId,
  infrastructure,
  logger,
  workerId = DEFAULT_WORKER_ID,
  now = new Date(),
}) {
  const leaseMs = Number(infrastructure?.config?.notifications?.leaseMs) || DEFAULT_LEASE_MS;

  // In-app rows have no provider; they are marked delivered once the guard confirms they are still valid.
  const preview = await Notification.findById(notificationId).select('channel status');
  if (preview?.channel === 'IN_APP') {
    const doc = await Notification.findById(notificationId);
    if (FINAL_STATUSES.includes(doc.status) || doc.status === 'SCHEDULED') {
      return { skipped: true, reason: doc.status === 'SCHEDULED' ? 'TOO_EARLY' : 'ALREADY_FINAL' };
    }
    const guard = await runNotificationGuard(doc);
    if (!guard.ok) {
      await Notification.updateOne(
        { _id: doc._id, status: { $in: ['PENDING', 'RETRYING'] } },
        { $set: { status: 'CANCELLED', failureCode: guard.reason || 'superseded', failedAt: now } },
      );
      return { skipped: false, status: 'CANCELLED' };
    }
    await Notification.updateOne(
      { _id: doc._id, status: { $in: ['PENDING', 'RETRYING'] } },
      { $set: { status: 'SENT', deliveredAt: now } },
    );
    return { skipped: false, status: 'SENT' };
  }

  // Atomic claim: only one worker can move the document to SENDING and own its lease.
  const doc = await Notification.findOneAndUpdate(
    {
      _id: notificationId,
      channel: { $ne: 'IN_APP' },
      status: { $in: ['PENDING', 'RETRYING'] },
      $and: [
        { $or: [{ scheduledAt: null }, { scheduledAt: { $lte: now } }] },
        { $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
        { $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lt: now } }] },
      ],
    },
    {
      $set: {
        status: 'SENDING',
        leaseOwner: workerId,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        lastAttemptAt: now,
      },
      $inc: { attemptCount: 1 },
    },
    { new: true },
  );
  if (!doc) {
    return explainNotClaimed(notificationId, now);
  }

  const guard = await runNotificationGuard(doc);
  if (!guard.ok) {
    if (guard.retry && doc.attemptCount < MAX_DELIVERY_ATTEMPTS) {
      await finishClaimed(doc, workerId, {
        status: 'RETRYING',
        failureCode: guard.reason,
        nextAttemptAt: new Date(now.getTime() + backoffMs(doc.attemptCount)),
      });
      return { skipped: false, status: 'RETRYING' };
    }
    await finishClaimed(doc, workerId, {
      status: 'CANCELLED',
      failureCode: guard.reason || 'superseded',
      errorCategory: 'cancelled',
      failedAt: now,
    });
    return { skipped: false, status: 'CANCELLED' };
  }

  const user = await User.findById(doc.recipientUserId).select('email accountStatus whatsappNumber');
  if (!user || user.accountStatus !== 'ACTIVE') {
    await finishClaimed(doc, workerId, {
      status: 'CANCELLED',
      failureCode: 'recipient_inactive',
      errorCategory: 'permanent',
      failedAt: now,
    });
    return { skipped: false, status: 'CANCELLED' };
  }

  let result;
  try {
    if (doc.channel === 'EMAIL') {
      result = user.email
        ? await infrastructure.email.send({
            to: user.email,
            subject: doc.title || doc.type,
            body: doc.body || doc.title || doc.type,
          })
        : { accepted: false, retryable: false, category: 'no_recipient_address' };
    } else if (doc.channel === 'WHATSAPP') {
      const plan = resolveWhatsAppMessage({ notification: doc, config: infrastructure?.config });
      if (!user.whatsappNumber) {
        result = { accepted: false, retryable: false, category: 'no_recipient_address' };
      } else if (plan.mode === 'blocked') {
        result = { accepted: false, retryable: false, category: plan.category };
      } else {
        result = await infrastructure.whatsapp.send({
          to: user.whatsappNumber,
          body: doc.body || doc.title || doc.type,
          ...(plan.mode === 'template' ? { template: plan.template } : {}),
        });
      }
    } else {
      result = { accepted: false, retryable: false, category: 'unknown_channel' };
    }
  } catch (error) {
    logger?.warn('Notification provider threw', { channel: doc.channel, notificationId: String(doc._id) });
    result = { accepted: false, retryable: true, category: 'transient' };
  }

  const classified = classifyProviderResult(result);
  const common = {
    provider: result?.provider,
    providerMessageId: result?.providerMessageId,
    errorCategory: classified.category,
  };

  if (classified.status === 'SENT') {
    const saved = await finishClaimed(doc, workerId, { ...common, status: 'SENT' }, { failedAt: '', failureCode: '' });
    return saved ? { skipped: false, status: 'SENT' } : { skipped: true, reason: 'LEASE_LOST' };
  }

  if (classified.retryable && doc.attemptCount < MAX_DELIVERY_ATTEMPTS) {
    const saved = await finishClaimed(doc, workerId, {
      ...common,
      status: 'RETRYING',
      failureCode: classified.category,
      nextAttemptAt: new Date(now.getTime() + backoffMs(doc.attemptCount)),
    });
    return saved ? { skipped: false, status: 'RETRYING' } : { skipped: true, reason: 'LEASE_LOST' };
  }

  const saved = await finishClaimed(doc, workerId, {
    ...common,
    status: 'FAILED',
    failureCode: classified.category,
    failedAt: now,
  });
  return saved ? { skipped: false, status: 'FAILED' } : { skipped: true, reason: 'LEASE_LOST' };
}
