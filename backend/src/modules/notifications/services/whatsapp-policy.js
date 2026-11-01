/**
 * WhatsApp messaging policy. CA examination messages are business-initiated: Meta only accepts them as
 * approved template messages. Free-form text is only valid inside a 24-hour customer service window,
 * and this system does not record inbound messages, so it cannot prove a window is open.
 * These types therefore never fall back to plain text.
 */
export const WHATSAPP_TEMPLATE_REQUIRED_TYPES = Object.freeze([
  'CA_EXAM_SCHEDULED',
  'CA_EXAM_RESCHEDULED',
  'CA_EXAM_CANCELLED',
  'CA_EXAM_COMPLETED',
  'CA_EXAM_MISSED',
  'CA_REMINDER',
]);

/**
 * Decide how to send a WhatsApp notification.
 * Returns { mode: 'template', template } | { mode: 'text' } | { mode: 'blocked', category }.
 */
export function resolveWhatsAppMessage({ notification, config }) {
  if (!WHATSAPP_TEMPLATE_REQUIRED_TYPES.includes(notification.type)) {
    return { mode: 'text' };
  }
  const name = config?.whatsapp?.templates?.[notification.type];
  if (!name) {
    return { mode: 'blocked', category: 'whatsapp_template_not_configured' };
  }
  return {
    mode: 'template',
    template: {
      name,
      language: config?.whatsapp?.templateLanguage || 'en',
      parameters: Array.isArray(notification.templateParams) ? notification.templateParams : [],
    },
  };
}
