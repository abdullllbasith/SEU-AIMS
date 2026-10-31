import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedError, ValidationError } from '../../../shared/errors/app-error.js';
import { incrementMetric } from '../../../infrastructure/observability/metrics.js';
import { Notification } from '../../notifications/index.js';

/**
 * Apply Meta delivery receipts (entry[].changes[].value.statuses[]) to WhatsApp notifications.
 * Only forward transitions are applied: SENT -> DELIVERED (delivered/read) or SENT -> FAILED.
 * Call this only after the request signature has been verified.
 */
export async function applyWhatsAppStatuses(payload) {
  const statuses = (Array.isArray(payload?.entry) ? payload.entry : [])
    .flatMap((entry) => (Array.isArray(entry?.changes) ? entry.changes : []))
    .flatMap((change) => (Array.isArray(change?.value?.statuses) ? change.value.statuses : []));
  const result = { delivered: 0, failed: 0, ignored: 0 };
  for (const status of statuses) {
    const providerMessageId = String(status?.id || '');
    if (!providerMessageId) {
      result.ignored += 1;
      continue;
    }
    const at = Number(status.timestamp) ? new Date(Number(status.timestamp) * 1000) : new Date();
    if (status.status === 'delivered' || status.status === 'read') {
      const update = await Notification.updateOne(
        { providerMessageId, channel: 'WHATSAPP', status: 'SENT' },
        { $set: { status: 'DELIVERED', deliveredAt: at } },
      );
      result[update.modifiedCount ? 'delivered' : 'ignored'] += 1;
    } else if (status.status === 'failed') {
      const update = await Notification.updateOne(
        { providerMessageId, channel: 'WHATSAPP', status: 'SENT' },
        {
          $set: {
            status: 'FAILED',
            failedAt: at,
            failureCode: String(status.errors?.[0]?.code ?? 'provider_failed'),
            errorCategory: 'provider_failed',
          },
        },
      );
      result[update.modifiedCount ? 'failed' : 'ignored'] += 1;
    } else {
      result.ignored += 1;
    }
  }
  return result;
}

export function verifyWhatsAppWebhookGet(query, config) {
  const expected = config?.whatsapp?.webhookVerifyToken;
  if (!expected) {
    throw new ValidationError('WhatsApp webhook verification is not configured');
  }
  if (String(query['hub.verify_token'] || '') !== expected) {
    throw new UnauthorizedError('Webhook verification failed');
  }
  return String(query['hub.challenge'] || '');
}

export function verifyWhatsAppWebhookSignature(rawBody, signatureHeader, config) {
  const secret = config?.whatsapp?.appSecret;
  if (!secret) {
    incrementMetric('webhook.whatsapp.unconfigured');
    throw new UnauthorizedError('Webhook signature verification is not configured');
  }
  const provided = String(signatureHeader || '');
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody || '').digest('hex')}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    incrementMetric('webhook.whatsapp.invalid_signature');
    throw new UnauthorizedError('Invalid webhook signature');
  }
  incrementMetric('webhook.whatsapp.accepted');
  return true;
}
