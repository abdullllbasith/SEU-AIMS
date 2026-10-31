import { Notification } from '../models/notification.model.js';
import { JOB_NAMES } from '../../../infrastructure/queue/job-names.js';
import { MAX_DELIVERY_ATTEMPTS } from '../constants.js';
import { runNotificationGuard } from './guards.js';
import { DEFAULT_WORKER_ID } from './delivery.service.js';

const STALE_PENDING_MS = 5 * 60_000;

async function enqueueDelivery(infrastructure, notification, suffix = '') {
  if (!infrastructure?.queue?.enqueue) {
    return false;
  }
  await infrastructure.queue.enqueue({
    name: JOB_NAMES.NOTIFICATION_DELIVER,
    payload: { notificationId: String(notification._id) },
    jobId: `notify.deliver:${notification._id}${suffix}`,
  });
  return true;
}

/**
 * Release notifications that have become due and recover stuck ones. Every state move is a single
 * conditional findOneAndUpdate, so several workers can run this at the same time without releasing,
 * enqueuing or delivering the same notification twice.
 *
 *  1. SCHEDULED, due        -> PENDING (claim) -> guard -> IN_APP: SENT, other channels: enqueue
 *  2. RETRYING, backoff over -> PENDING (claim) -> enqueue
 *  3. SENDING, lease expired -> PENDING (claim) -> enqueue (at-least-once; FAILED after the last attempt)
 *  4. PENDING, stale         -> re-enqueue (delivery itself is claim-protected)
 */
export async function releaseDueNotifications({ now = new Date(), infrastructure, limit = 200 } = {}) {
  const summary = { released: 0, cancelled: 0, retried: 0, recovered: 0, requeued: 0 };

  // 1. Due scheduled notifications.
  const seen = [];
  for (let index = 0; index < limit; index += 1) {
    const doc = await Notification.findOneAndUpdate(
      { status: 'SCHEDULED', scheduledAt: { $lte: now }, _id: { $nin: seen } },
      { $set: { status: 'PENDING' } },
      { new: true, sort: { scheduledAt: 1 } },
    );
    if (!doc) {
      break;
    }
    seen.push(doc._id);
    const guard = await runNotificationGuard(doc);
    if (!guard.ok) {
      if (guard.retry) {
        // The guard could not verify the notification; put it back and look again on the next sweep.
        await Notification.updateOne({ _id: doc._id, status: 'PENDING' }, { $set: { status: 'SCHEDULED' } });
        continue;
      }
      await Notification.updateOne(
        { _id: doc._id, status: 'PENDING' },
        { $set: { status: 'CANCELLED', failureCode: guard.reason || 'superseded', failedAt: now } },
      );
      summary.cancelled += 1;
      continue;
    }
    if (doc.channel === 'IN_APP') {
      await Notification.updateOne({ _id: doc._id, status: 'PENDING' }, { $set: { status: 'SENT', deliveredAt: now } });
    } else {
      await enqueueDelivery(infrastructure, doc);
    }
    summary.released += 1;
  }

  // 2. Retries whose backoff has elapsed.
  for (let index = 0; index < limit; index += 1) {
    const doc = await Notification.findOneAndUpdate(
      { status: 'RETRYING', nextAttemptAt: { $lte: now } },
      { $set: { status: 'PENDING' } },
      { new: true },
    );
    if (!doc) {
      break;
    }
    await enqueueDelivery(infrastructure, doc, `:retry${doc.attemptCount}`);
    summary.retried += 1;
  }

  // 3. Expired leases: the worker died or stalled while SENDING.
  for (let index = 0; index < limit; index += 1) {
    const doc = await Notification.findOneAndUpdate(
      { status: 'SENDING', leaseExpiresAt: { $lt: now } },
      { $set: { status: 'PENDING', failureCode: 'lease_expired' }, $unset: { leaseOwner: '', leaseExpiresAt: '' } },
      { new: true },
    );
    if (!doc) {
      break;
    }
    if (doc.attemptCount >= MAX_DELIVERY_ATTEMPTS) {
      await Notification.updateOne(
        { _id: doc._id, status: 'PENDING' },
        { $set: { status: 'FAILED', failedAt: now, errorCategory: 'lease_expired' } },
      );
    } else {
      await enqueueDelivery(infrastructure, doc, `:recover${doc.attemptCount}`);
    }
    summary.recovered += 1;
  }

  // 4. Pending deliveries whose queue job was lost. Touch updatedAt first so another sweeper skips them.
  // updatedAt is written by the database driver with the wall clock, so staleness is judged against the
  // wall clock too (not the `now` used for due times), and a row is claimed at most once per sweep.
  const staleBefore = new Date(Date.now() - STALE_PENDING_MS);
  const requeued = [];
  for (let index = 0; index < limit; index += 1) {
    const doc = await Notification.findOneAndUpdate(
      {
        status: 'PENDING',
        channel: { $ne: 'IN_APP' },
        _id: { $nin: requeued },
        updatedAt: { $lt: staleBefore },
        $and: [
          { $or: [{ scheduledAt: null }, { scheduledAt: { $lte: now } }] },
          { $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
          { $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lt: now } }] },
        ],
      },
      { $set: { lastAttemptAt: now } },
      { new: true },
    );
    if (!doc) {
      break;
    }
    requeued.push(doc._id);
    await enqueueDelivery(infrastructure, doc, `:requeue${now.getTime()}`);
    summary.requeued += 1;
  }

  return summary;
}

export { DEFAULT_WORKER_ID };
