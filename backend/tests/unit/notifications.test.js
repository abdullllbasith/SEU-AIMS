import assert from 'node:assert/strict';
import test from 'node:test';
import { renderTemplate } from '../../src/modules/notifications/utils/templates.js';
import { isMandatoryType } from '../../src/modules/notifications/services/fanout.service.js';
import { classifyProviderResult } from '../../src/modules/notifications/services/delivery.service.js';
import { classifyWhatsAppHttpStatus, createWhatsAppProvider } from '../../src/infrastructure/providers/whatsapp-provider.js';

test('templates interpolate allowlisted variables and ignore executable tokens', () => {
  const out = renderTemplate('Hello {{title}} {{execute}} {{eventTitle}}', {
    title: 'Exam week',
    execute: 'rm -rf',
    eventTitle: 'ICT1233',
  });
  assert.equal(out.includes('Exam week'), true);
  assert.equal(out.includes('ICT1233'), true);
  assert.equal(out.includes('rm -rf'), false);
});

test('mandatory notification types cannot be treated as optional preference targets', () => {
  assert.equal(isMandatoryType('NOTICE_PUBLISHED'), true);
  assert.equal(isMandatoryType('RESULTS_UPDATED'), true);
  assert.equal(isMandatoryType('CA_REMINDER'), false);
});

test('provider acceptance is not treated as delivered', () => {
  assert.equal(classifyProviderResult({ accepted: true, category: 'accepted' }).status, 'SENT');
  assert.notEqual(classifyProviderResult({ accepted: true }).status, 'DELIVERED');
  assert.equal(classifyProviderResult({ accepted: false, retryable: true, category: 'transient' }).status, 'RETRYING');
  assert.equal(classifyProviderResult({ accepted: false, retryable: false, category: 'not_configured' }).status, 'FAILED');
});

test('WhatsApp HTTP statuses classify retryable vs permanent failures', () => {
  assert.equal(classifyWhatsAppHttpStatus(429).retryable, true);
  assert.equal(classifyWhatsAppHttpStatus(503).retryable, true);
  assert.equal(classifyWhatsAppHttpStatus(401).retryable, false);
  assert.equal(classifyWhatsAppHttpStatus(400).retryable, false);
});

test('WhatsApp adapter stays noop without credentials and does not require Meta', async () => {
  const provider = createWhatsAppProvider({ config: { whatsapp: {} } });
  const result = await provider.send({ to: '94770000000', body: 'hi' });
  assert.equal(result.provider, 'noop');
  assert.equal(result.accepted, false);
});
