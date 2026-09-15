import { NotificationPreference } from '../models/notification-preference.model.js';
import { SUPPORTED_LOCALES } from '../constants.js';
import { AuditEvent } from '../../audit-security/index.js';

export function mapPreference(doc) {
  return {
    locale: doc.locale || 'en',
    emailEnabled: doc.emailEnabled,
    whatsappEnabled: doc.whatsappEnabled,
    inAppEnabled: true,
  };
}

export async function getPreferences(principal) {
  const doc = await NotificationPreference.findOne({ userId: principal.userId });
  if (!doc) {
    return mapPreference({ locale: 'en', emailEnabled: true, whatsappEnabled: true, inAppEnabled: true });
  }
  return mapPreference(doc);
}

export async function updatePreferences(principal, body = {}) {
  const locale = SUPPORTED_LOCALES.includes(body.locale) ? body.locale : 'en';
  const doc = await NotificationPreference.findOneAndUpdate(
    { userId: principal.userId },
    {
      userId: principal.userId,
      locale,
      emailEnabled: body.emailEnabled !== false,
      whatsappEnabled: body.whatsappEnabled !== false,
      inAppEnabled: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await AuditEvent.create({
    actorUserId: principal.userId,
    action: 'notification.preference.update',
    entityType: 'NotificationPreference',
    entityId: String(doc._id),
    metadata: { locale: doc.locale },
    occurredAt: new Date(),
  });
  return mapPreference(doc);
}
