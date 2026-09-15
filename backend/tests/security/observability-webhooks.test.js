import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { validateProductionConfig } from '../../src/config/validate-production.js';
import { verifyWhatsAppWebhookSignature } from '../../src/modules/audit-security/index.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-12';

function app() {
  const config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  config.whatsapp.appSecret = 'webhook-secret';
  config.whatsapp.webhookVerifyToken = 'verify-me';
  return createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
  });
}

test('liveness is public and correlation headers are set', async () => {
  const response = await request(app()).get('/api/health/live').set('x-correlation-id', 'corr-1');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.check, 'live');
  assert.equal(response.headers['x-correlation-id'], 'corr-1');
  assert.ok(response.headers['x-request-id']);
});

test('unauthenticated audit and ops routes are denied', async () => {
  const client = request(app());
  assert.equal((await client.get('/api/audit/events')).status, 401);
  assert.equal((await client.get('/api/ops/metrics')).status, 401);
});

test('unsigned WhatsApp webhook is rejected', async () => {
  const response = await request(app()).post('/api/webhooks/whatsapp').send({ hello: true });
  assert.equal(response.status, 401);
});

test('signed WhatsApp webhook is accepted', async () => {
  const body = '{"object":"whatsapp_business_account"}';
  const signature = `sha256=${createHmac('sha256', 'webhook-secret').update(body).digest('hex')}`;
  const response = await request(app())
    .post('/api/webhooks/whatsapp')
    .set('content-type', 'application/json')
    .set('x-hub-signature-256', signature)
    .send(body);
  assert.equal(response.status, 200);
});

test('webhook GET verify token is required', async () => {
  const ok = await request(app()).get('/api/webhooks/whatsapp').query({
    'hub.verify_token': 'verify-me',
    'hub.challenge': 'abc',
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.text, 'abc');
  const bad = await request(app()).get('/api/webhooks/whatsapp').query({
    'hub.verify_token': 'nope',
    'hub.challenge': 'abc',
  });
  assert.equal(bad.status, 401);
});

test('production config gate does not treat wildcard CORS or local storage as verified', () => {
  const result = validateProductionConfig({
    isProduction: true,
    auth: { jwtSecret: 'x', cookieSecure: false },
    api: { corsOrigin: '*' },
    mongo: {},
    redis: {},
    storage: { driver: 'local_dev' },
    logLevel: 'debug',
  });
  assert.equal(result.ok, false);
  assert.ok(result.problems.length >= 4);
});

test('verify helper rejects mismatched signatures', () => {
  assert.throws(() =>
    verifyWhatsAppWebhookSignature(Buffer.from('{}'), 'sha256=dead', { whatsapp: { appSecret: 'webhook-secret' } }),
  );
});
