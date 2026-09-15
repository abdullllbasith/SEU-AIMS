import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { seedQaWorld, QA_IDS, QA_PASSWORD } from '../helpers/qa-fixtures.js';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { User } from '../../src/modules/authentication/models/user.model.js';
import { ROLES } from '../../src/shared/constants/roles.js';

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
  return { agent, csrfToken: response.body.data.csrfToken, user: response.body.data.user };
}

test('profile_mass_assignment_cannot_change_role_or_department', async () => {
  const session = await login(QA_IDS.STUDENT_A);
  const otherDept = (await User.findOne({ email: QA_IDS.ADMIN_B })).departmentId;
  const patched = await session.agent
    .patch('/api/me/profile')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      displayName: 'STUDENT_A',
      role: ROLES.DEPARTMENT_ADMINISTRATOR,
      departmentId: String(otherDept),
      registrationNumber: 'SEU/IS/22/ICT/B01',
      officialGrade: 'A+',
      approvalStatus: 'APPROVED',
    });
  assert.equal(patched.status, 403);
  const stored = await User.findOne({ email: QA_IDS.STUDENT_A });
  assert.equal(stored.role, ROLES.STUDENT);
  assert.equal(String(stored.departmentId) !== String(otherDept), true);
});

test('mongo_operator_payloads_are_not_applied_as_query_operators', async () => {
  const session = await login(QA_IDS.STUDENT_A);
  const patched = await session.agent
    .patch('/api/me/profile')
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      displayName: { $ne: null },
    });
  assert.ok([200, 400].includes(patched.status));
  if (patched.status === 200) {
    assert.equal(typeof patched.body.data.displayName, 'string');
  }
  const user = await User.findOne({ email: QA_IDS.STUDENT_A });
  assert.equal(typeof user.displayName, 'string');
});

test('notification_query_cannot_override_recipient_via_operator', async () => {
  const session = await login(QA_IDS.STUDENT_A);
  const inbox = await session.agent.get('/api/notifications').query({
    recipientUserId: { $ne: 'x' },
    unread: { $ne: null },
  });
  assert.equal(inbox.status, 200);
  assert.equal(inbox.body.data.items.length, 1);
});

test('api_errors_do_not_include_stack_traces', async () => {
  const session = await login(QA_IDS.STUDENT_A);
  const response = await session.agent.get('/api/ca/applications/not-a-valid-id');
  assert.ok(response.status >= 400);
  const text = JSON.stringify(response.body);
  assert.equal(text.includes('at '), false);
  assert.equal(Boolean(response.body.error?.stack), false);
  assert.ok(response.body.error?.code);
});

test('oversized_search_string_is_bounded', async () => {
  const session = await login(QA_IDS.STUDENT_A);
  const q = 'a'.repeat(10_000);
  const search = await session.agent.get('/api/study-room/students/search').query({ q });
  assert.ok([200, 400].includes(search.status));
  if (search.status === 200) {
    assert.ok(Array.isArray(search.body.data.items || search.body.data));
  }
});
