import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colomboLocalToUtc, formatColombo } from '../../src/shared/time/colombo.js';
import { deriveApplicationStatus } from '../../src/modules/ca-recovery/services/application-status.service.js';
import {
  APPLICATION_TRANSITIONS,
  assertSubjectExamTransition,
} from '../../src/modules/ca-recovery/services/transitions.js';
import { buildCaMessage } from '../../src/modules/ca-recovery/services/exam-messages.js';
import {
  NoopEmailProvider,
  SmtpEmailProvider,
  classifySmtpError,
  createEmailProvider,
} from '../../src/infrastructure/providers/email-provider.js';
import {
  MetaWhatsAppProvider,
  buildMessagePayload,
} from '../../src/infrastructure/providers/whatsapp-provider.js';
import { resolveWhatsAppMessage } from '../../src/modules/notifications/services/whatsapp-policy.js';
import { backoffMs, classifyProviderResult } from '../../src/modules/notifications/services/delivery.service.js';
import { renderTemplate } from '../../src/modules/notifications/utils/templates.js';

test('Colombo local time converts to UTC with +05:30 and rejects invalid input', () => {
  assert.equal(colomboLocalToUtc('2026-11-10', '09:30').toISOString(), '2026-11-10T04:00:00.000Z');
  assert.equal(colomboLocalToUtc('2026-11-10', '00:00').toISOString(), '2026-11-09T18:30:00.000Z');
  assert.equal(colomboLocalToUtc('2026-02-31', '09:00'), null);
  assert.equal(colomboLocalToUtc('10/11/2026', '09:00'), null);
  assert.equal(colomboLocalToUtc('2026-11-10', '9:00'), null);
  assert.equal(colomboLocalToUtc('', ''), null);
});

test('Colombo formatting is independent of the server time zone', () => {
  const when = formatColombo('2026-11-10T04:00:00.000Z');
  assert.equal(when.time, '09:30');
  assert.match(when.date, /10 Nov 2026/);
  assert.match(when.text, /Asia\/Colombo/);
  // Late evening UTC is already the next morning in Colombo.
  assert.equal(formatColombo('2026-11-09T19:00:00.000Z').time, '00:30');
  assert.match(formatColombo('2026-11-09T19:00:00.000Z').date, /10 Nov 2026/);
});

test('reminder instants are exact multiples of 24h before the exam in Colombo wall-clock time', () => {
  const exam = colomboLocalToUtc('2026-11-10', '09:30');
  for (const days of [7, 3, 1]) {
    const reminder = new Date(exam.getTime() - days * 24 * 3600_000);
    assert.equal(formatColombo(reminder).time, '09:30');
  }
});

test('application status is derived from every subject, never from one', () => {
  assert.equal(deriveApplicationStatus([]), null);
  assert.equal(deriveApplicationStatus(['READY_TO_SCHEDULE', 'READY_TO_SCHEDULE']), 'APPROVED');
  assert.equal(deriveApplicationStatus(['SCHEDULED', 'READY_TO_SCHEDULE']), 'SCHEDULED');
  assert.equal(deriveApplicationStatus(['COMPLETED', 'READY_TO_SCHEDULE']), 'SCHEDULED');
  assert.equal(deriveApplicationStatus(['COMPLETED', 'SCHEDULED']), 'SCHEDULED');
  assert.equal(deriveApplicationStatus(['COMPLETED', 'COMPLETED']), 'COMPLETED');
  assert.equal(deriveApplicationStatus(['COMPLETED', 'RESOLVED']), 'COMPLETED');
  assert.equal(deriveApplicationStatus(['RESOLVED', 'READY_TO_SCHEDULE']), 'APPROVED');
  assert.equal(deriveApplicationStatus(['RESOLVED', 'RESOLVED']), 'RESOLVED');
});

test('SCHEDULED may return to APPROVED only as an application transition; subject transitions are guarded', () => {
  assert.ok(APPLICATION_TRANSITIONS.SCHEDULED.includes('APPROVED'));
  assert.ok(!APPLICATION_TRANSITIONS.REJECTED.includes('APPROVED'));
  assertSubjectExamTransition('READY_TO_SCHEDULE', 'SCHEDULED');
  assertSubjectExamTransition('SCHEDULED', 'READY_TO_SCHEDULE');
  assertSubjectExamTransition('SCHEDULED', 'COMPLETED');
  assert.throws(() => assertSubjectExamTransition('COMPLETED', 'SCHEDULED'));
  assert.throws(() => assertSubjectExamTransition('RESOLVED', 'SCHEDULED'));
  assert.throws(() => assertSubjectExamTransition('PENDING_APPROVAL', 'SCHEDULED'));
});

test('exam messages carry subject, Colombo time, venue and ordered WhatsApp parameters', () => {
  const notice = { scheduledAt: colomboLocalToUtc('2026-11-10', '09:30'), venue: 'Main Hall' };
  const subject = { code: 'ICT1233', name: 'Programming' };
  const scheduled = buildCaMessage({ type: 'CA_EXAM_SCHEDULED', subject, notice });
  assert.deepEqual(scheduled.templateParams, ['ICT1233', 'Programming', scheduled.vars.examDate, '09:30', 'Main Hall']);
  const body = renderTemplate(scheduled.vars.bodyTemplate, scheduled.vars);
  assert.match(body, /ICT1233 Programming/);
  assert.match(body, /09:30 \(Asia\/Colombo\)/);
  assert.match(body, /Venue: Main Hall/);
  const reminder = buildCaMessage({ type: 'CA_REMINDER', subject, notice, offsetDays: 3 });
  assert.equal(reminder.templateParams.at(-1), '3');
  assert.match(renderTemplate(reminder.vars.bodyTemplate, reminder.vars), /in 3 day\(s\)/);
  const cancelled = buildCaMessage({ type: 'CA_EXAM_CANCELLED', subject, notice, reason: 'Hall unavailable' });
  assert.equal(cancelled.templateParams.at(-1), 'Hall unavailable');
});

test('SMTP provider reports acceptance, classifies failures and never claims unconfigured sends', async () => {
  const sent = [];
  const accepting = new SmtpEmailProvider({
    config: { from: 'noreply@seu.test', smtp: {} },
    transport: {
      sendMail: async (mail) => (sent.push(mail), { messageId: '<id@seu>', rejected: [] }),
    },
  });
  const ok = await accepting.send({ to: 'a@b.test', subject: 'Hi', body: 'Body' });
  assert.deepEqual(ok, { accepted: true, provider: 'smtp', providerMessageId: '<id@seu>', category: 'accepted' });
  assert.equal(sent[0].from, 'noreply@seu.test');
  assert.equal(sent[0].text, 'Body');

  assert.equal((await accepting.send({ subject: 'x', body: 'y' })).category, 'no_recipient_address');

  const rejecting = new SmtpEmailProvider({
    config: { from: 'a@b.test', smtp: {} },
    transport: { sendMail: async () => ({ messageId: 'x', rejected: ['a@b.test'] }) },
  });
  const rejected = await rejecting.send({ to: 'a@b.test', subject: 's', body: 'b' });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.retryable, false);

  const failing = (error) =>
    new SmtpEmailProvider({
      config: { from: 'a@b.test', smtp: {} },
      transport: {
        sendMail: async () => {
          throw Object.assign(new Error('x'), error);
        },
      },
    });
  const timeout = await failing({ code: 'ETIMEDOUT' }).send({ to: 'a@b.test', subject: 's', body: 'b' });
  assert.deepEqual([timeout.accepted, timeout.retryable, timeout.category], [false, true, 'timeout']);
  assert.deepEqual(classifySmtpError({ code: 'EAUTH' }), { retryable: false, category: 'auth' });
  assert.deepEqual(classifySmtpError({ responseCode: 451 }), { retryable: true, category: 'transient' });
  assert.deepEqual(classifySmtpError({ responseCode: 550 }), { retryable: false, category: 'permanent' });
  assert.equal(classifySmtpError({ code: 'ECONNREFUSED' }).retryable, true);

  assert.ok(createEmailProvider({ config: { email: { provider: 'noop' } } }) instanceof NoopEmailProvider);
  assert.ok(createEmailProvider({ config: { email: { provider: 'smtp', smtp: {}, from: 'a@b.test' } } }) instanceof NoopEmailProvider);
  const noop = await new NoopEmailProvider().send({ to: 'a@b.test' });
  assert.equal(noop.accepted, false);
  assert.equal(noop.category, 'not_configured');
  assert.ok(
    createEmailProvider({
      config: { email: { provider: 'smtp', from: 'a@b.test', smtp: { host: 'smtp.test', port: 587, secure: false } } },
    }) instanceof SmtpEmailProvider,
  );
});

test('WhatsApp provider builds approved-template payloads and text payloads', async () => {
  const template = buildMessagePayload({
    to: '94771234567',
    template: { name: 'ca_exam_scheduled', language: 'en', parameters: ['ICT1233', 'Line\nbreak', 'Main Hall'] },
  });
  assert.equal(template.type, 'template');
  assert.equal(template.template.name, 'ca_exam_scheduled');
  assert.deepEqual(template.template.language, { code: 'en' });
  assert.deepEqual(template.template.components[0].parameters.map((item) => item.text), ['ICT1233', 'Line break', 'Main Hall']);
  assert.equal(buildMessagePayload({ to: '1', body: 'hello' }).type, 'text');

  const requests = [];
  const provider = new MetaWhatsAppProvider({
    config: { baseUrl: 'https://graph.test', version: 'v21.0', phoneNumberId: '123', accessToken: 'tok' },
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.1' }] }) };
    },
  });
  const result = await provider.send({ to: '94771234567', template: { name: 'ca_reminder', language: 'en', parameters: ['x'] } });
  assert.deepEqual(result, { accepted: true, provider: 'meta', providerMessageId: 'wamid.1', category: 'accepted' });
  assert.equal(requests[0].url, 'https://graph.test/v21.0/123/messages');
  assert.equal(requests[0].body.type, 'template');

  const down = new MetaWhatsAppProvider({
    config: { baseUrl: 'https://graph.test', version: 'v21.0', phoneNumberId: '123', accessToken: 'tok' },
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  });
  const failed = await down.send({ to: '1', body: 'x' });
  assert.deepEqual([failed.accepted, failed.retryable], [false, true]);
});

test('WhatsApp policy requires an approved template for CA exam messages and never falls back to text', () => {
  const config = { whatsapp: { templateLanguage: 'si', templates: { CA_EXAM_SCHEDULED: 'ca_exam_scheduled' } } };
  const planned = resolveWhatsAppMessage({
    notification: { type: 'CA_EXAM_SCHEDULED', templateParams: ['a', 'b'] },
    config,
  });
  assert.equal(planned.mode, 'template');
  assert.deepEqual(planned.template, { name: 'ca_exam_scheduled', language: 'si', parameters: ['a', 'b'] });
  for (const type of ['CA_EXAM_RESCHEDULED', 'CA_EXAM_CANCELLED', 'CA_REMINDER']) {
    assert.deepEqual(resolveWhatsAppMessage({ notification: { type }, config }), {
      mode: 'blocked',
      category: 'whatsapp_template_not_configured',
    });
  }
  assert.equal(resolveWhatsAppMessage({ notification: { type: 'NOTICE_PUBLISHED' }, config }).mode, 'text');
});

test('provider results classify into SENT, RETRYING and FAILED; backoff grows and is capped', () => {
  assert.equal(classifyProviderResult({ accepted: true }).status, 'SENT');
  assert.equal(classifyProviderResult({ accepted: false, retryable: true, category: 'timeout' }).status, 'RETRYING');
  assert.equal(classifyProviderResult({ accepted: false, retryable: false, category: 'not_configured' }).status, 'FAILED');
  assert.equal(classifyProviderResult(undefined).status, 'FAILED');
  assert.deepEqual([1, 2, 3, 4].map(backoffMs), [60_000, 120_000, 240_000, 480_000]);
  assert.equal(backoffMs(20), 30 * 60_000);
});
