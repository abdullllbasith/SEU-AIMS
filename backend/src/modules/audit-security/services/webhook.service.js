import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedError, ValidationError } from '../../../shared/errors/app-error.js';
import { incrementMetric } from '../../../infrastructure/observability/metrics.js';

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
