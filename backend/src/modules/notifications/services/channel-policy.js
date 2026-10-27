import { MANDATORY_NOTIFICATION_TYPES, OPTIONAL_NOTIFICATION_TYPES } from '../constants.js';

/**
 * Channel selection for one recipient.
 * Mandatory types, and any type that is not on the optional list, use every requested channel.
 * Optional types follow email and WhatsApp preferences. In-app stays on unless the stored preference is explicitly off.
 * Quiet hours are not applied. No approved rule says which messages may be delayed.
 */
export function channelsForNotification({
  type,
  preferences = {},
  requested = ['IN_APP', 'EMAIL', 'WHATSAPP'],
}) {
  const mandatory = MANDATORY_NOTIFICATION_TYPES.includes(type) || !OPTIONAL_NOTIFICATION_TYPES.includes(type);
  return requested.filter((channel) => {
    if (mandatory) {
      return true;
    }
    if (channel === 'IN_APP') {
      return preferences.inAppEnabled !== false;
    }
    if (channel === 'EMAIL') {
      return preferences.emailEnabled !== false;
    }
    if (channel === 'WHATSAPP') {
      return preferences.whatsappEnabled !== false;
    }
    return false;
  });
}
