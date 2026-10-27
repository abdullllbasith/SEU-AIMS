import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { seedQaWorld, QA_IDS, QA_PASSWORD } from '../helpers/qa-fixtures.js';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-14';
process.env.NODE_ENV = 'test';

let app;

before(async () => {
  await startIsolatedMongo();
  const config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  config.auth.loginMaxAttempts = 100;
  app = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
  });
});

after(async () => {
  await stopIsolatedMongo();
});

beforeEach(async () => {
  await clearIsolatedMongo();
  await seedQaWorld();
});

async function login(email) {
  const agent = request.agent(app);
  const csrf = await agent.get('/api/auth/csrf');
  const response = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf.body.data.csrfToken)
    .send({ identifier: email, password: QA_PASSWORD });
  assert.equal(response.status, 200);
  return { agent, csrfToken: response.body.data.csrfToken };
}

test('smoke_api_health_live_and_ready', async () => {
  const live = await request(app).get('/api/health/live');
  const ready = await request(app).get('/api/health/ready');
  assert.equal(live.status, 200);
  assert.equal(ready.status, 200);
});

test('smoke_student_can_login_and_read_dashboard_results_notices_calendar_notifications', async () => {
  const session = await login(QA_IDS.STUDENT_A);
  const dashboard = await session.agent.get('/api/me/dashboard');
  const results = await session.agent.get('/api/results/me');
  const notices = await session.agent.get('/api/notices');
  const calendar = await session.agent.get('/api/calendar/upcoming');
  const notifications = await session.agent.get('/api/notifications');
  assert.equal(dashboard.status, 200);
  assert.equal(results.status, 200);
  assert.equal(notices.status, 200);
  assert.equal(calendar.status, 200);
  assert.equal(notifications.status, 200);
});

test('smoke_lecturer_can_read_assigned_offerings', async () => {
  const session = await login(QA_IDS.LECTURER_A);
  const offerings = await session.agent.get('/api/academic/me/offerings');
  assert.equal(offerings.status, 200);
  assert.ok((offerings.body.data.items || []).length >= 1);
});

test('smoke_admin_can_read_ops_and_academic_scope', async () => {
  const session = await login(QA_IDS.ADMIN_A);
  const ops = await session.agent.get('/api/ops/metrics');
  const integrity = await session.agent.get('/api/ops/integrity');
  assert.equal(ops.status, 200);
  assert.equal(integrity.status, 200);
});
