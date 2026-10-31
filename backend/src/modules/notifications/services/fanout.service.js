import { Notification } from '../models/notification.model.js';
import { NotificationTemplate } from '../models/notification-template.model.js';
import { JOB_NAMES } from '../../../infrastructure/queue/job-names.js';
import { MANDATORY_NOTIFICATION_TYPES, OPTIONAL_NOTIFICATION_TYPES } from '../constants.js';
import { BUILTIN_TITLES, renderTemplate } from '../utils/templates.js';
import { safeActionPath } from '../utils/http.js';
import { getPreferences } from './preference.service.js';
import { channelsForNotification } from './channel-policy.js';
import { User } from '../../authentication/models/user.model.js';

function categoryFor(type) {
  if (String(type).startsWith('CA_')) {
    return 'ca_recovery';
  }
  if (String(type).startsWith('RESULTS')) {
    return 'results';
  }
  if (String(type).includes('NOTICE')) {
    return 'notice';
  }
  if (String(type).includes('CALENDAR') || String(type).includes('EVENT')) {
    return 'calendar';
  }
  if (String(type).includes('STUDY_ROOM')) {
    return 'system';
  }
  return 'system';
}

export function isMandatoryType(type) {
  return MANDATORY_NOTIFICATION_TYPES.includes(type);
}

export async function resolveTitle(type, vars, locale = 'en') {
  const stored = await NotificationTemplate.findOne({
    eventType: type,
    locale,
    channel: 'IN_APP',
    active: true,
  });
  const template = stored?.title || BUILTIN_TITLES[type] || type;
  return renderTemplate(template, vars);
}

export async function fanoutNotification({
  recipientUserId,
  type,
  sourceModule,
  sourceId,
  reminderOffsetDays,
  reminderOffsetHours,
  reminderGeneration,
  scheduledAt,
  actionPath,
  vars = {},
  departmentId,
  infrastructure,
  channels = ['IN_APP', 'EMAIL', 'WHATSAPP'],
  templateParams,
  guardRef,
}) {
  const user = await User.findById(recipientUserId);
  if (!user || user.accountStatus !== 'ACTIVE') {
    return { created: 0 };
  }
  const mandatory = isMandatoryType(type) || !OPTIONAL_NOTIFICATION_TYPES.includes(type);
  const prefs = await getPreferences({ userId: recipientUserId });
  const title = await resolveTitle(type, vars, prefs.locale);
  const body = renderTemplate(vars.bodyTemplate || title, vars);
  const allowed = new Set(channelsForNotification({ type, preferences: prefs, requested: channels }));
  let created = 0;
  for (const channel of allowed) {
    const idempotencyKey = reminderOffsetDays
      ? `${type}:${sourceId}:${recipientUserId}:${reminderOffsetDays}:${reminderGeneration || 0}:${channel}`
      : reminderOffsetHours !== undefined && reminderOffsetHours !== null
        ? `${type}:${sourceId}:${recipientUserId}:${reminderOffsetHours}:${reminderGeneration || 0}:${channel}`
        : `${type}:${sourceId}:${recipientUserId}:${channel}`;
    const future = Boolean(scheduledAt && scheduledAt > new Date());
    // An in-app row is delivered the moment it exists; future ones wait for the dispatcher.
    const status = future ? 'SCHEDULED' : channel === 'IN_APP' ? 'SENT' : 'PENDING';
    try {
      const doc = await Notification.create({
        recipientUserId,
        type,
        sourceModule,
        sourceId: String(sourceId),
        channel,
        status,
        deliveredAt: status === 'SENT' ? new Date() : undefined,
        templateParams,
        guardRef,
        category: categoryFor(type),
        title,
        body,
        actionPath: safeActionPath(actionPath),
        departmentId,
        mandatory,
        locale: prefs.locale,
        scheduledAt,
        reminderOffsetDays,
        reminderOffsetHours,
        reminderGeneration,
        idempotencyKey,
      });
      created += 1;
      if (channel !== 'IN_APP' && doc.status === 'PENDING' && infrastructure?.queue?.enqueue) {
        await infrastructure.queue.enqueue({
          name: JOB_NAMES.NOTIFICATION_DELIVER,
          payload: { notificationId: String(doc._id) },
          jobId: `notify.deliver:${doc._id}`,
        });
      }
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
  }
  return { created };
}
