import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { seedQaWorld, QA_IDS, QA_PASSWORD } from '../helpers/qa-fixtures.js';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { User } from '../../src/modules/authentication/models/user.model.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-14';
process.env.NODE_ENV = 'test';

let app;
let world;

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
  world = await seedQaWorld();
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

test('student_cannot_read_another_students_result_or_dashboard', async () => {
  const a = await login(QA_IDS.STUDENT_A);
  const b = await login(QA_IDS.STUDENT_B);
  const aResults = await a.agent.get('/api/results/me');
  const bResults = await b.agent.get('/api/results/me');
  assert.equal(aResults.status, 200);
  assert.equal(bResults.status, 200);
  assert.ok(aResults.body.data.all.some((item) => item.resultCode === 'B' && item.isEca === false));
  assert.ok(bResults.body.data.all.some((item) => item.isEca === true));
  const steal = await b.agent.get('/api/results/me').query({ studentId: String(world.studentA._id) });
  assert.equal(steal.status, 403);
  const aDash = await a.agent.get('/api/me/dashboard');
  const bDash = await b.agent.get('/api/me/dashboard');
  assert.equal(aDash.status, 200);
  assert.equal(bDash.status, 200);
  assert.ok(JSON.stringify(aDash.body).includes('SEU/IS/21/ICT/A01'));
  assert.equal(JSON.stringify(bDash.body).includes('SEU/IS/21/ICT/A01'), false);
});

test('student_cannot_read_or_mark_another_students_notification', async () => {
  const a = await login(QA_IDS.STUDENT_A);
  const b = await login(QA_IDS.STUDENT_B);
  const inboxA = await a.agent.get('/api/notifications');
  assert.equal(inboxA.status, 200);
  assert.equal(inboxA.body.data.items.length, 1);
  const aId = inboxA.body.data.items[0].id;
  const steal = await b.agent
    .patch(`/api/notifications/${aId}/read`)
    .set('X-CSRF-Token', b.csrfToken)
    .send({});
  assert.equal(steal.status, 404);
});

test('student_cannot_read_another_students_ca_application', async () => {
  const a = await login(QA_IDS.STUDENT_A);
  const hidden = await a.agent.get(`/api/ca/applications/${world.applicationB.applicationId}`);
  assert.equal(hidden.status, 404);
});

test('lecturer_cannot_access_study_room_api', async () => {
  const lecturer = await login(QA_IDS.LECTURER_A);
  const access = await lecturer.agent.get('/api/study-room/access');
  assert.equal(access.status, 403);
});

test('lecturer_cannot_manage_unassigned_subject_offering', async () => {
  const lecturer = await login(QA_IDS.LECTURER_A);
  const resources = await lecturer.agent.get(`/api/learning/offerings/${world.offeringB._id}/resources`);
  assert.ok([403, 404].includes(resources.status));
});

test('cross_department_admin_cannot_read_other_department_audit', async () => {
  const other = await login(QA_IDS.ADMIN_B);
  const events = await other.agent.get('/api/audit/events');
  assert.equal(events.status, 200);
  assert.equal(events.body.data.items.length, 0);
});

test('student_cannot_perform_administrator_result_import', async () => {
  const student = await login(QA_IDS.STUDENT_A);
  const list = await student.agent.get('/api/results/imports');
  assert.equal(list.status, 403);
});

test('inactive_account_cannot_login', async () => {
  await User.updateOne({ email: QA_IDS.STUDENT_A }, { $set: { accountStatus: 'SUSPENDED' } });
  const agent = request.agent(app);
  const csrf = await agent.get('/api/auth/csrf');
  const response = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf.body.data.csrfToken)
    .send({ identifier: QA_IDS.STUDENT_A, password: QA_PASSWORD });
  assert.equal(response.status, 401);
});
