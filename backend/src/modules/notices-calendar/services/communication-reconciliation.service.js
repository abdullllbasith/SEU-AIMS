import { Notification } from '../../notifications/index.js';
import { CalendarEvent } from '../models/calendar-event.model.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';

const OPEN_DELIVERY = ['PENDING', 'QUEUED', 'SENDING', 'RETRYING', 'SCHEDULED'];

function assertAdmin(principal) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
}

export async function reconcileCommunication(principal) {
  assertAdmin(principal);
  const departmentId = principal.departmentId;
  const issues = [];
  const open = await Notification.find({
    departmentId,
    status: { $in: OPEN_DELIVERY },
    type: { $in: ['CALENDAR_REMINDER', 'CA_REMINDER'] },
  })
    .select('sourceId type status')
    .limit(200)
    .lean();
  const eventIds = [...new Set(open.map((row) => row.sourceId).filter(Boolean))];
  const cancelled = await CalendarEvent.find({
    _id: { $in: eventIds },
    departmentId,
    cancelledAt: { $ne: null },
  })
    .select('_id')
    .lean();
  const cancelledIds = new Set(cancelled.map((row) => String(row._id)));
  for (const row of open) {
    if (!cancelledIds.has(String(row.sourceId))) {
      continue;
    }
    issues.push({
      issue: 'REMINDER_FOR_CANCELLED_EVENT',
      entity: 'Notification',
      entityId: String(row._id),
      eventId: String(row.sourceId),
      status: row.status,
      recommendedAction: 'The calendar event is cancelled and this reminder is still open. This report does not send or delete it.',
    });
  }
  const openDeliveryCount = await Notification.countDocuments({
    departmentId,
    status: { $in: ['PENDING', 'QUEUED', 'SENDING', 'RETRYING'] },
  });
  return {
    issues,
    issueCount: issues.length,
    openDeliveryCount,
    definitions: {
      openDeliveryCount: 'Notifications in this department that are not sent, delivered, failed, or cancelled. Age alone does not fail them.',
      reminderForCancelledEvent: 'An open calendar or CA reminder whose calendar event has cancelledAt set.',
    },
  };
}
