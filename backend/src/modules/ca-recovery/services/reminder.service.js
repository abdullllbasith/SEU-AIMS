import { CA_REMINDER_OFFSETS_DAYS } from '../constants.js';
import { Notification } from '../../notifications/index.js';
import { emitCaNotification } from './notify.js';
import { buildCaMessage } from './exam-messages.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CANCELLABLE = ['SCHEDULED', 'PENDING', 'RETRYING'];
const GUARDED_TYPES = ['CA_REMINDER', 'CA_EXAM_SCHEDULED', 'CA_EXAM_RESCHEDULED'];

export function noticeSourceId(notice, link) {
  return `${notice._id}:${notice.generation}:${link._id}`;
}

export function guardRefFor(notice, link) {
  // Current-batch students have no subject link; they are guarded by the notice generation only.
  if (link.batch) {
    return { noticeId: String(notice._id), generation: notice.generation, audience: 'BATCH' };
  }
  return { noticeId: String(notice._id), generation: notice.generation, linkId: String(link._id) };
}

/**
 * Create the 7, 3 and 1 day reminders (one document per channel) for each student subject on a notice.
 * They are stored as SCHEDULED with scheduledAt = exam time minus N x 24h (the same Colombo wall-clock time,
 * since Sri Lanka has no DST) and are released by the notification dispatcher when due.
 * An offset whose time has already passed is skipped; a "7 day" reminder is never sent late.
 * Returns the offsets that were created and skipped.
 */
export async function queueRemindersForLinks({ notice, entries, infrastructure, now = new Date() }) {
  const created = new Set();
  const skipped = new Set();
  for (const { link, application, subject } of entries) {
    for (const offsetDays of CA_REMINDER_OFFSETS_DAYS) {
      const fireAt = new Date(notice.scheduledAt.getTime() - offsetDays * DAY_MS);
      if (fireAt.getTime() <= now.getTime()) {
        skipped.add(offsetDays);
        continue;
      }
      const { vars, templateParams } = buildCaMessage({ type: 'CA_REMINDER', subject, notice, application, offsetDays });
      await emitCaNotification({
        recipientUserId: application.studentUserId,
        type: 'CA_REMINDER',
        sourceId: noticeSourceId(notice, link),
        reminderOffsetDays: offsetDays,
        reminderGeneration: notice.generation,
        scheduledAt: fireAt,
        departmentId: application.departmentId,
        infrastructure,
        vars,
        templateParams,
        guardRef: guardRefFor(notice, link),
      });
      created.add(offsetDays);
    }
  }
  return { created: [...created], skipped: [...skipped].filter((offset) => !created.has(offset)) };
}

/**
 * Cancel not-yet-sent exam notifications. Scoped by notice, and optionally by generation (`beforeGeneration`
 * cancels older generations) or by a single subject link, so other subjects are never affected.
 */
export async function cancelNotificationsFor({ noticeId, beforeGeneration, linkId }, failureCode) {
  const filter = {
    sourceModule: 'ca-recovery',
    type: { $in: GUARDED_TYPES },
    'guardRef.noticeId': String(noticeId),
    status: { $in: CANCELLABLE },
  };
  if (beforeGeneration !== undefined) {
    filter['guardRef.generation'] = { $lt: beforeGeneration };
  }
  if (linkId) {
    filter['guardRef.linkId'] = String(linkId);
  }
  const result = await Notification.updateMany(filter, {
    $set: { status: 'CANCELLED', failureCode, errorCategory: 'cancelled', failedAt: new Date() },
  });
  return { cancelled: result.modifiedCount };
}
