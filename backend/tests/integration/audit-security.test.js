import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { User } from '../../src/modules/authentication/models/user.model.js';
import { hashPassword } from '../../src/modules/authentication/security/passwords.js';
import { Department } from '../../src/modules/academic-foundation/models/department.model.js';
import { AuditEvent, recordAudit } from '../../src/modules/audit-security/index.js';
import { ROLES } from '../../src/shared/constants/roles.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-12';
process.env.NODE_ENV = 'test';

let app;

before(async () => {
  await startIsolatedMongo();
  const config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
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
});

async function login(email) {
  const agent = request.agent(app);
  const csrf = await agent.get('/api/auth/csrf');
  const response = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf.body.data.csrfToken)
    .send({ identifier: email, password: 'correcthorse' });
  assert.equal(response.status, 200);
  return { agent, csrfToken: response.body.data.csrfToken };
}

test('department admin can read own audit summary; mutations are rejected; other department is empty', async () => {
  const department = await Department.create({ code: 'ICT', name: 'ICT' });
  const other = await Department.create({ code: 'MGT', name: 'MGT' });
  await User.create({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'admin@example.test',
    displayName: 'Admin',
    accountStatus: 'ACTIVE',
    departmentId: department._id,
    passwordHash: await hashPassword('correcthorse', { minLength: 10 }),
    lecturerStatus: 'NOT_APPLICABLE',
  });
  await User.create({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'other-admin@example.test',
    displayName: 'Other',
    accountStatus: 'ACTIVE',
    departmentId: other._id,
    passwordHash: await hashPassword('correcthorse', { minLength: 10 }),
    lecturerStatus: 'NOT_APPLICABLE',
  });
  await recordAudit({
    actorUserId: (await User.findOne({ email: 'admin@example.test' }))._id,
    actorRole: ROLES.DEPARTMENT_ADMINISTRATOR,
    departmentId: department._id,
    action: 'notice.publish',
    entityType: 'Notice',
    entityId: 'n1',
    ip: '127.0.0.1',
  });

  const admin = await login('admin@example.test');
  const list = await admin.agent.get('/api/audit/events');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.items.length, 1);
  assert.equal(list.body.data.items[0].action, 'notice.publish');
  assert.equal(list.body.data.items[0].ipHash, undefined);

  const mutate = await admin.agent
    .patch(`/api/audit/events/${list.body.data.items[0].id}`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ action: 'tamper' });
  assert.equal(mutate.status, 400);

  const otherAdmin = await login('other-admin@example.test');
  const empty = await otherAdmin.agent.get('/api/audit/events');
  assert.equal(empty.status, 200);
  assert.equal(empty.body.data.items.length, 0);

  const student = await User.create({
    role: ROLES.STUDENT,
    email: 'student@example.test',
    displayName: 'Student',
    accountStatus: 'ACTIVE',
    departmentId: department._id,
    passwordHash: await hashPassword('correcthorse', { minLength: 10 }),
    lecturerStatus: 'NOT_APPLICABLE',
  });
  const studentSession = await login('student@example.test');
  assert.equal((await studentSession.agent.get('/api/audit/events')).status, 403);
  assert.equal((await studentSession.agent.get('/api/ops/integrity')).status, 403);
  const integrity = await admin.agent.get('/api/ops/integrity');
  assert.equal(integrity.status, 200);
  assert.ok('issueCount' in integrity.body.data);
  assert.ok(student);
});

test('audit documents reject in-place updates', async () => {
  const doc = await AuditEvent.create({
    action: 'auth.login',
    entityType: 'User',
    entityId: 'u1',
    occurredAt: new Date(),
  });
  await assert.rejects(() => AuditEvent.findOneAndUpdate({ _id: doc._id }, { action: 'tamper' }));
});
