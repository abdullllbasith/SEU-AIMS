import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { User } from '../../src/modules/authentication/models/user.model.js';
import { hashPassword } from '../../src/modules/authentication/security/passwords.js';
import { PasswordResetToken } from '../../src/modules/authentication/models/password-reset-token.model.js';
import { hashSecret } from '../../src/modules/authentication/security/tokens.js';
import { createOpaqueToken } from '../../src/modules/authentication/security/tokens.js';
import { ROLES } from '../../src/shared/constants/roles.js';
import { Department } from '../../src/modules/academic-foundation/models/department.model.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-04';
process.env.NODE_ENV = 'test';

let mongoReady = false;
let app;
let config;

before(async () => {
  try {
    await startIsolatedMongo();
    mongoReady = true;
    config = loadConfig();
    config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
    config.auth.loginMaxAttempts = 100;
    const logger = createLogger({ service: 'seu-aims-test', level: 'error' });
    app = createApp({
      config,
      logger,
      infrastructure: { email: { send: async () => ({ accepted: false, provider: 'noop' }) } },
    });
  } catch (error) {
    process.stderr.write(`Skipping auth integration tests: ${error.message}\n`);
  }
});

after(async () => {
  if (mongoReady) {
    await stopIsolatedMongo();
  }
});

beforeEach(async () => {
  if (mongoReady) {
    await clearIsolatedMongo();
  }
});

function dbTest(name, fn) {
  test(name, async (t) => {
    if (!mongoReady) {
      t.skip('Isolated MongoDB is not available in this environment');
      return;
    }
    await fn(t);
  });
}

async function createUser({
  role,
  email,
  password = 'correcthorse',
  accountStatus = 'ACTIVE',
  departmentId,
}) {
  return User.create({
    role,
    email,
    displayName: email,
    accountStatus,
    departmentId,
    passwordHash: await hashPassword(password, { minLength: 10 }),
    lecturerStatus: role === ROLES.LECTURER ? 'VERIFIED' : 'NOT_APPLICABLE',
  });
}

async function csrfAgent() {
  const agent = request.agent(app);
  const csrf = await agent.get('/api/auth/csrf');
  return { agent, csrfToken: csrf.body.data.csrfToken };
}

dbTest('login succeeds for active users and does not return password hashes', async () => {
  await createUser({ role: ROLES.STUDENT, email: 'student@example.test' });
  const { agent, csrfToken } = await csrfAgent();
  const response = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrfToken)
    .send({ identifier: 'student@example.test', password: 'correcthorse' });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.user.email, 'student@example.test');
  assert.equal(response.body.data.user.passwordHash, undefined);
  assert.equal(response.body.data.accessToken, undefined);
});

dbTest('login failures are generic and do not enumerate accounts', async () => {
  const { agent, csrfToken } = await csrfAgent();
  const missing = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrfToken)
    .send({ identifier: 'nobody@example.test', password: 'correcthorse' });
  const { agent: agent2, csrfToken: csrf2 } = await csrfAgent();
  await createUser({ role: ROLES.STUDENT, email: 'student@example.test' });
  const wrong = await agent2
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf2)
    .send({ identifier: 'student@example.test', password: 'wrong-password-1' });
  assert.equal(missing.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(missing.body.error.message, wrong.body.error.message);
});

dbTest('suspended users cannot login', async () => {
  await createUser({
    role: ROLES.STUDENT,
    email: 'suspended@example.test',
    accountStatus: 'SUSPENDED',
  });
  const { agent, csrfToken } = await csrfAgent();
  const response = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrfToken)
    .send({ identifier: 'suspended@example.test', password: 'correcthorse' });
  assert.equal(response.status, 401);
});

dbTest('students can open Study Room access while lecturers and admins cannot', async () => {
  await createUser({ role: ROLES.STUDENT, email: 'student@example.test' });
  await createUser({ role: ROLES.LECTURER, email: 'lecturer@example.test' });
  await createUser({ role: ROLES.DEPARTMENT_ADMINISTRATOR, email: 'admin@example.test' });

  async function accessAs(email) {
    const { agent, csrfToken } = await csrfAgent();
    await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ identifier: email, password: 'correcthorse' });
    const meCsrf = await agent.get('/api/auth/csrf');
    return agent.get('/api/study-room/access').set('X-CSRF-Token', meCsrf.body.data.csrfToken);
  }

  assert.equal((await accessAs('student@example.test')).status, 200);
  assert.equal((await accessAs('lecturer@example.test')).status, 403);
  assert.equal((await accessAs('admin@example.test')).status, 403);
});

dbTest('clients cannot mass-assign a role onto their profile', async () => {
  await createUser({ role: ROLES.STUDENT, email: 'student@example.test' });
  const { agent, csrfToken } = await csrfAgent();
  const login = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrfToken)
    .send({ identifier: 'student@example.test', password: 'correcthorse' });
  const response = await agent
    .patch('/api/auth/me')
    .set('X-CSRF-Token', login.body.data.csrfToken)
    .send({ role: ROLES.DEPARTMENT_ADMINISTRATOR, displayName: 'Hacked' });
  assert.equal(response.status, 403);
});

dbTest('password reset is generic and consumes a single-use token', async () => {
  await createUser({ role: ROLES.STUDENT, email: 'student@example.test' });
  const { agent, csrfToken } = await csrfAgent();
  const forgot = await agent
    .post('/api/auth/forgot-password')
    .set('X-CSRF-Token', csrfToken)
    .send({ identifier: 'missing@example.test' });
  assert.equal(forgot.status, 200);

  const raw = createOpaqueToken();
  const user = await User.findOne({ email: 'student@example.test' });
  await PasswordResetToken.create({
    userId: user._id,
    tokenHash: hashSecret(raw),
    expiresAt: new Date(Date.now() + 60_000),
  });
  const reset = await agent
    .post('/api/auth/reset-password')
    .set('X-CSRF-Token', csrfToken)
    .send({ token: raw, nextPassword: 'newhorseok1' });
  assert.equal(reset.status, 200);
  const replay = await agent
    .post('/api/auth/reset-password')
    .set('X-CSRF-Token', csrfToken)
    .send({ token: raw, nextPassword: 'newhorseok2' });
  assert.equal(replay.status, 401);
});

dbTest('administrators cannot create users in another department', async () => {
  const ownDepartment = await Department.create({ code: 'ICT', name: 'Department of ICT' });
  const otherDepartment = await Department.create({ code: 'ENG', name: 'English' });
  await createUser({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'admin@example.test',
    departmentId: ownDepartment._id,
  });
  const { agent, csrfToken } = await csrfAgent();
  const login = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrfToken)
    .send({ identifier: 'admin@example.test', password: 'correcthorse' });
  const response = await agent
    .post('/api/auth/users')
    .set('X-CSRF-Token', login.body.data.csrfToken)
    .send({
      email: 'lecturer@example.test',
      password: 'correcthorse',
      role: ROLES.LECTURER,
      displayName: 'Other Dept Lecturer',
      departmentId: String(otherDepartment._id),
    });
  assert.equal(response.status, 201);
  assert.equal(response.body.data.user.departmentId, String(ownDepartment._id));
  assert.notEqual(response.body.data.user.departmentId, String(otherDepartment._id));
  const created = await User.findOne({ email: 'lecturer@example.test' });
  assert.equal(String(created.departmentId), String(ownDepartment._id));
});

dbTest('administrators cannot change account status outside their department', async () => {
  const ownDepartment = await Department.create({ code: 'ICT', name: 'Department of ICT' });
  const otherDepartment = await Department.create({ code: 'ENG', name: 'English' });
  await createUser({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'admin@example.test',
    departmentId: ownDepartment._id,
  });
  const outsider = await createUser({
    role: ROLES.STUDENT,
    email: 'outsider@example.test',
    departmentId: otherDepartment._id,
  });
  const { agent, csrfToken } = await csrfAgent();
  const login = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrfToken)
    .send({ identifier: 'admin@example.test', password: 'correcthorse' });
  const response = await agent
    .patch(`/api/auth/users/${outsider._id}/status`)
    .set('X-CSRF-Token', login.body.data.csrfToken)
    .send({ accountStatus: 'SUSPENDED' });
  assert.equal(response.status, 404);
  const unchanged = await User.findById(outsider._id);
  assert.equal(unchanged.accountStatus, 'ACTIVE');
});
