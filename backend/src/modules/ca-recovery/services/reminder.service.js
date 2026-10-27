import { CaSchedule } from '../models/ca-schedule.model.js';
import { CaApplication } from '../models/ca-application.model.js';
import { CA_REMINDER_OFFSETS_DAYS } from '../constants.js';
import { JOB_NAMES } from '../../../infrastructure/queue/job-names.js';
import { emitCaNotification } from './notify.js';
import { Notification } from '../../notifications/index.js';

export async function queueRemindersForSchedule(schedule, application, infrastructure) {
  for (const offsetDays of CA_REMINDER_OFFSETS_DAYS) {
    const scheduledAt = new Date(schedule.scheduledAt.getTime() - offsetDays * 24 * 60 * 60 * 1000);
    if (infrastructure?.queue?.enqueue) {
      await infrastructure.queue.enqueue({
        name: JOB_NAMES.REMINDER_SCHEDULE,
        payload: { scheduleId: String(schedule._id), offsetDays },
        jobId: `ca.reminder:${schedule._id}:${offsetDays}`,
      });
    }
    await emitCaNotification({
      recipientUserId: application.studentUserId,
      type: 'CA_REMINDER',
      sourceId: String(schedule._id),
      reminderOffsetDays: offsetDays,
      scheduledAt,
      infrastructure,
      departmentId: application.departmentId,
    });
  }
}

export async function evaluateReminder({ scheduleId, offsetDays, now = new Date(), infrastructure }) {
  const schedule = await CaSchedule.findById(scheduleId);
  if (!schedule || schedule.cancelledAt) {
    return { sent: false, reason: 'CANCELLED_OR_MISSING' };
  }
  const application = await CaApplication.findById(schedule.applicationId);
  if (!application || !['APPROVED', 'SCHEDULED', 'COMPLETED'].includes(application.workflowStatus)) {
    return { sent: false, reason: 'NOT_ELIGIBLE' };
  }
  const fireAt = new Date(schedule.scheduledAt.getTime() - offsetDays * 24 * 60 * 60 * 1000);
  if (now.getTime() < fireAt.getTime()) {
    return { sent: false, reason: 'TOO_EARLY' };
  }
  const already = await Notification.findOne({
    idempotencyKey: `CA_REMINDER:${scheduleId}:${offsetDays}:IN_APP`,
    status: 'SENT',
  });
  if (already) {
    return { sent: false, reason: 'ALREADY_SENT' };
  }
  await Notification.updateMany(
    {
      sourceModule: 'ca-recovery',
      sourceId: String(schedule._id),
      reminderOffsetDays: offsetDays,
      channel: 'IN_APP',
    },
    { $set: { status: 'SENT', deliveredAt: now } },
  );
  const pending = await Notification.find({
    sourceModule: 'ca-recovery',
    sourceId: String(schedule._id),
    reminderOffsetDays: offsetDays,
    channel: { $in: ['EMAIL', 'WHATSAPP'] },
    status: { $in: ['PENDING', 'SCHEDULED'] },
  });
  for (const doc of pending) {
    doc.status = 'PENDING';
    await doc.save();
    if (infrastructure?.queue?.enqueue) {
      await infrastructure.queue.enqueue({
        name: JOB_NAMES.NOTIFICATION_DELIVER,
        payload: { notificationId: String(doc._id) },
        jobId: `notify.deliver:${doc._id}`,
      });
    }
  }
  return { sent: true };
}
