import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import mongoose from 'mongoose';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { createFileStorage } from '../../src/infrastructure/storage/file-storage.js';
import { User } from '../../src/modules/authentication/models/user.model.js';
import { hashPassword } from '../../src/modules/authentication/security/passwords.js';
import { Department } from '../../src/modules/academic-foundation/models/department.model.js';
import { ROLES } from '../../src/shared/constants/roles.js';
import { StoredFile } from '../../src/modules/files/models/stored-file.model.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-04';
process.env.NODE_ENV = 'test';

let mongoReady = false;
let app;
let storage;

before(async () => {
  try {
    await startIsolatedMongo();
    mongoReady = true;
    const config = loadConfig();
    config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
    config.auth.loginMaxAttempts = 100;
    config.storage = { driver: 'local_dev', localPath: path.join(os.tmpdir(), `seu-aims-files-${process.pid}`) };
    storage = createFileStorage({ config, backendRoot: process.cwd() });
    app = createApp({
      config,
      logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
      infrastructure: {
        email: { send: async () => ({ accepted: false, provider: 'noop' }) },
        storage,
        malwareScanner: { scan: async () => ({ clean: true, status: 'clean' }) },
      },
    });
  } catch (error) {
    process.stderr.write(`Skipping file reconciliation tests: ${error.message}\n`);
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

async function createUser({ role, email, departmentId }) {
  return User.create({
    role,
    email,
    displayName: email,
    accountStatus: 'ACTIVE',
    departmentId,
    passwordHash: await hashPassword('correcthorse', { minLength: 10 }),
    lecturerStatus: role === ROLES.LECTURER ? 'VERIFIED' : 'NOT_APPLICABLE',
  });
}

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

dbTest('file reconciliation reports storage drift and does not change the file', async () => {
  const department = await Department.create({ code: 'ICT', name: 'Department of ICT' });
  const other = await Department.create({ code: 'ENG', name: 'Department of Engineering' });
  const admin = await createUser({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'admin@example.test',
    departmentId: department._id,
  });
  const student = await createUser({
    role: ROLES.STUDENT,
    email: 'student@example.test',
    departmentId: department._id,
  });
  await createUser({
    role: ROLES.LECTURER,
    email: 'lecturer@example.test',
    departmentId: department._id,
  });
  const outsider = await createUser({
    role: ROLES.STUDENT,
    email: 'other@example.test',
    departmentId: other._id,
  });

  const body = Buffer.from('abcd');
  const driftedKey = `profile/${admin._id}/${randomUUID()}`;
  await storage.putObject({ key: driftedKey, body, contentType: 'application/pdf' });
  const drifted = await StoredFile.create({
    storageKey: driftedKey,
    originalFilename: 'notes.pdf',
    displayFilename: 'notes.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 99,
    uploadedByUserId: admin._id,
    owningDomain: 'PROFILE_IMAGE',
    owningContextId: new mongoose.Types.ObjectId(),
    scanStatus: 'UNSAFE',
    reviewStatus: 'PENDING',
    availability: 'AVAILABLE',
    checksumSha256: createHash('sha256').update('different').digest('hex'),
  });
  const missing = await StoredFile.create({
    storageKey: `profile/${student._id}/${randomUUID()}`,
    originalFilename: 'missing.pdf',
    displayFilename: 'missing.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 4,
    uploadedByUserId: student._id,
    owningDomain: 'PROFILE_IMAGE',
    owningContextId: new mongoose.Types.ObjectId(),
    scanStatus: 'UPLOADED',
    availability: 'UNAVAILABLE',
  });
  const foreign = await StoredFile.create({
    storageKey: `profile/${outsider._id}/${randomUUID()}`,
    originalFilename: 'foreign.pdf',
    displayFilename: 'foreign.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 4,
    uploadedByUserId: outsider._id,
    owningDomain: 'PROFILE_IMAGE',
    owningContextId: new mongoose.Types.ObjectId(),
    scanStatus: 'UPLOADED',
    availability: 'UNAVAILABLE',
  });

  const studentSession = await login('student@example.test');
  const lecturerSession = await login('lecturer@example.test');
  assert.equal((await studentSession.agent.get('/api/files/admin/reconciliation')).status, 403);
  assert.equal((await lecturerSession.agent.get('/api/files/admin/reconciliation')).status, 403);

  const adminSession = await login('admin@example.test');
  const report = await adminSession.agent.get('/api/files/admin/reconciliation');
  assert.equal(report.status, 200);
  const codes = report.body.data.issues.filter((item) => item.entityId === String(drifted._id)).map((item) => item.issue);
  assert.equal(codes.includes('SIZE_MISMATCH'), true);
  assert.equal(codes.includes('HASH_MISMATCH'), true);
  assert.equal(codes.includes('AVAILABLE_WITHOUT_SAFE_SCAN'), true);
  assert.equal(
    report.body.data.issues.some((item) => item.entityId === String(missing._id) && item.issue === 'METADATA_WITHOUT_OBJECT'),
    true,
  );
  assert.equal(report.body.data.issues.some((item) => item.entityId === String(foreign._id)), false);
  const payload = JSON.stringify(report.body.data);
  assert.equal(payload.includes(driftedKey), false);
  assert.equal(payload.includes('notes.pdf'), false);
  const unchanged = await StoredFile.findById(drifted._id);
  assert.equal(unchanged.availability, 'AVAILABLE');
  assert.equal(unchanged.scanStatus, 'UNSAFE');
});
