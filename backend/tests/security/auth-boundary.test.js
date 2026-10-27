import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { createMalwareScanner } from '../../src/infrastructure/providers/malware-scanner.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-04';

test('unauthenticated API access is denied by default', async () => {
  const config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  const app = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
  });
  const response = await request(app).get('/api/me');
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('unauthenticated academic administration is denied', async () => {
  const config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  const app = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
  });
  const response = await request(app).post('/api/academic/subject-offerings').send({});
  assert.equal(response.status, 401);
});

test('unauthenticated result import is denied', async () => {
  const config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  const app = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
  });
  const list = await request(app).get('/api/results/imports');
  assert.equal(list.status, 401);
  const mine = await request(app).get('/api/results/me');
  assert.equal(mine.status, 401);
  const dashboard = await request(app).get('/api/me/dashboard');
  assert.equal(dashboard.status, 401);
  const profile = await request(app).get('/api/me/profile');
  assert.equal(profile.status, 401);
});

test('unauthenticated communication routes are denied', async () => {
  const config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  const app = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
  });
  const notices = await request(app).get('/api/notices');
  assert.equal(notices.status, 401);
  const calendar = await request(app).get('/api/calendar/events');
  assert.equal(calendar.status, 401);
  const notifications = await request(app).get('/api/notifications');
  assert.equal(notifications.status, 401);
});

test('unauthenticated CA recovery routes are denied', async () => {
  const config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  const app = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
  });
  const list = await request(app).get('/api/ca/admin/applications');
  assert.equal(list.status, 401);
  const mine = await request(app).get('/api/ca/applications');
  assert.equal(mine.status, 401);
});

test('unconfigured malware scanner does not mark files clean', async () => {
  const scanner = createMalwareScanner({ config: {} });
  const result = await scanner.scan({ key: 'quarantine/example.bin' });
  assert.equal(result.clean, false);
  assert.equal(result.status, 'not_configured');
});

test('dev_trust scanner is local only and production refuses it', async () => {
  const local = createMalwareScanner({
    config: { isProduction: false, malwareScanner: { provider: 'dev_trust' } },
  });
  const trusted = await local.scan({ key: 'local/example.pdf' });
  assert.equal(trusted.clean, true);
  assert.throws(
    () => createMalwareScanner({ config: { isProduction: true, malwareScanner: { provider: 'dev_trust' } } }),
    /not allowed when NODE_ENV is production/,
  );
});
