import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { after, before, beforeEach, test } from 'node:test';
import request from 'supertest';
import { io as Client } from 'socket.io-client';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { createFileStorage } from '../../src/infrastructure/storage/file-storage.js';
import { createRealtimeServer } from '../../src/infrastructure/realtime/socket-server.js';
import { attachStudyRoomRealtime } from '../../src/modules/study-room/index.js';
import { User } from '../../src/modules/authentication/models/user.model.js';
import { hashPassword } from '../../src/modules/authentication/security/passwords.js';
import { Department } from '../../src/modules/academic-foundation/models/department.model.js';
import { Batch } from '../../src/modules/academic-foundation/models/batch.model.js';
import { AcademicYear } from '../../src/modules/academic-foundation/models/academic-year.model.js';
import { Semester } from '../../src/modules/academic-foundation/models/semester.model.js';
import { StudentAcademicContext } from '../../src/modules/academic-foundation/models/student-academic-context.model.js';
import { ROLES } from '../../src/shared/constants/roles.js';
import { Message } from '../../src/modules/study-room/models/message.model.js';
import { SharedResource } from '../../src/modules/study-room/models/shared-resource.model.js';
import {
  decryptText,
  derivePrivateKey,
  encryptText,
  generateGroupKey,
  generateIdentity,
  publicJwk,
  wrapGroup,
} from '../helpers/chat-crypto.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-04';
process.env.NODE_ENV = 'test';

const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n');

let mongoReady = false;
let app;
let config;
let httpServer;
let io;

before(async () => {
  try {
    await startIsolatedMongo();
    mongoReady = true;
    config = loadConfig();
    config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
    config.auth.loginMaxAttempts = 1000;
    config.api.rateLimitMax = 10_000;
    config.storage = { driver: 'local_dev', localPath: path.join(os.tmpdir(), `seu-aims-sr-${process.pid}`) };
    const logger = createLogger({ service: 'seu-aims-test', level: 'error' });
    app = createApp({
      config,
      logger,
      infrastructure: {
        email: { send: async () => ({ accepted: false, provider: 'noop' }) },
        storage: createFileStorage({ config, backendRoot: process.cwd() }),
        malwareScanner: { scan: async () => ({ clean: true, status: 'clean' }) },
        queue: { enqueue: async () => ({ id: 'test-scan' }) },
      },
    });
    httpServer = http.createServer(app);
    io = createRealtimeServer(httpServer, { corsOrigin: true });
    attachStudyRoomRealtime(io, { config, logger });
    await new Promise((resolve) => httpServer.listen(0, resolve));
  } catch (error) {
    process.stderr.write(`Skipping Study Room integration tests: ${error.message}\n`);
  }
});

after(async () => {
  if (io) {
    io.close();
  }
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
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
    displayName: email.split('@')[0],
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
  return { agent, csrfToken: response.body.data.csrfToken, cookies: response.headers['set-cookie'] };
}

async function seed() {
  const department = await Department.create({ code: 'ICT', name: 'Department of ICT' });
  const batch = await Batch.create({ departmentId: department._id, code: '22', name: '22 batch' });
  const otherBatch = await Batch.create({ departmentId: department._id, code: '21', name: '21 batch' });
  const year = await AcademicYear.create({ departmentId: department._id, sequence: 1, name: 'Year 1' });
  const semester = await Semester.create({
    departmentId: department._id,
    academicYearId: year._id,
    sequence: 1,
    name: 'Semester 1',
  });
  const admin = await createUser({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'admin@example.test',
    departmentId: department._id,
  });
  const lecturer = await createUser({
    role: ROLES.LECTURER,
    email: 'lecturer@example.test',
    departmentId: department._id,
  });
  const studentA = await createUser({
    role: ROLES.STUDENT,
    email: 'a@example.test',
    departmentId: department._id,
  });
  const studentB = await createUser({
    role: ROLES.STUDENT,
    email: 'b@example.test',
    departmentId: department._id,
  });
  const studentOtherBatch = await createUser({
    role: ROLES.STUDENT,
    email: 'other@example.test',
    departmentId: department._id,
  });
  await StudentAcademicContext.create({
    userId: studentA._id,
    departmentId: department._id,
    batchId: batch._id,
    registrationNumber: 'SEU/IS/22/ICT/001',
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
  });
  await StudentAcademicContext.create({
    userId: studentB._id,
    departmentId: department._id,
    batchId: batch._id,
    registrationNumber: 'SEU/IS/22/ICT/002',
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
  });
  await StudentAcademicContext.create({
    userId: studentOtherBatch._id,
    departmentId: department._id,
    batchId: otherBatch._id,
    registrationNumber: 'SEU/IS/21/ICT/009',
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
  });
  return { department, batch, admin, lecturer, studentA, studentB, studentOtherBatch };
}

async function registerKey(session, pair) {
  const jwk = await publicJwk(pair.publicKey);
  const response = await session.agent
    .put('/api/study-room/crypto/public-key')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ publicKeyJwk: jwk, keyVersion: '1' });
  assert.equal(response.status, 200);
  return jwk;
}

dbTest('lecturer and admin cannot use ordinary Study Room APIs', async () => {
  await seed();
  const lecturer = await login('lecturer@example.test');
  const admin = await login('admin@example.test');
  assert.equal((await lecturer.agent.get('/api/study-room/access')).status, 403);
  assert.equal((await admin.agent.get('/api/study-room/access')).status, 403);
  assert.equal((await lecturer.agent.get('/api/study-room/folders')).status, 403);
  const forged = await lecturer.agent
    .post('/api/study-room/conversations')
    .set('X-CSRF-Token', lecturer.csrfToken)
    .send({ role: ROLES.STUDENT, participantUserId: '000000000000000000000000' });
  assert.equal(forged.status, 403);
});

dbTest('student can enter Study Room, send encrypted common chat, and retries stay idempotent', async () => {
  await seed();
  const session = await login('a@example.test');
  const access = await session.agent.get('/api/study-room/access');
  assert.equal(access.status, 200);
  assert.equal(access.body.data.allowed, true);
  const conversationId = access.body.data.commonConversation.id;
  const identity = await generateIdentity();
  await registerKey(session, identity);
  const group = await generateGroupKey();
  const raw = await crypto.subtle.exportKey('raw', group);
  const wrap = await wrapGroup(raw, identity.privateKey, identity.publicKey);
  const envelopes = await session.agent
    .put(`/api/study-room/conversations/${conversationId}/key-envelopes`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({
      keyVersion: '1',
      envelopes: [{ recipientUserId: String((await User.findOne({ email: 'a@example.test' }))._id), ...wrap }],
    });
  assert.equal(envelopes.status, 200);
  const secret = 'common-room-secret-text';
  const encryptedPayload = await encryptText(group, secret);
  const clientMessageId = 'clientmsg_common_001';
  const first = await session.agent
    .post(`/api/study-room/conversations/${conversationId}/messages`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ clientMessageId, encryptedPayload });
  assert.equal(first.status, 201);
  const retry = await session.agent
    .post(`/api/study-room/conversations/${conversationId}/messages`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ clientMessageId, encryptedPayload });
  assert.equal(retry.status, 201);
  assert.equal(retry.body.data.duplicate, true);
  assert.equal(await Message.countDocuments({ conversationId }), 1);
  const stored = await Message.findOne({ conversationId });
  assert.equal(JSON.stringify(stored).includes(secret), false);
  assert.equal(stored.encryptedPayload.ciphertext.includes(secret), false);
  const history = await session.agent.get(`/api/study-room/conversations/${conversationId}/messages`);
  assert.equal(history.body.data.items.length, 1);
  assert.equal(await decryptText(group, history.body.data.items[0].encryptedPayload), secret);
  const secondPayload = await encryptText(group, 'second-cipher-message');
  const second = await session.agent
    .post(`/api/study-room/conversations/${conversationId}/messages`)
    .set('X-CSRF-Token', session.csrfToken)
    .send({ clientMessageId: 'clientmsg_common_002', encryptedPayload: secondPayload });
  assert.equal(second.status, 201);
  const negative = await session.agent.get(
    `/api/study-room/conversations/${conversationId}/messages?limit=-10000`,
  );
  assert.equal(negative.status, 400);
  assert.equal(await Message.countDocuments({ conversationId }), 2);
  const zero = await session.agent.get(`/api/study-room/conversations/${conversationId}/messages?limit=0`);
  assert.equal(zero.status, 400);
  const oversized = await session.agent.get(
    `/api/study-room/conversations/${conversationId}/messages?limit=99999`,
  );
  assert.equal(oversized.status, 200);
  assert.ok(oversized.body.data.items.length <= 50);
  assert.equal(oversized.body.data.items.length, 2);
});

dbTest('private chat is limited to participants; other batch students are concealed', async () => {
  const { studentA, studentB, studentOtherBatch } = await seed();
  const a = await login('a@example.test');
  const b = await login('b@example.test');
  const other = await login('other@example.test');
  const alice = await generateIdentity();
  const bob = await generateIdentity();
  await registerKey(a, alice);
  await registerKey(b, bob);
  const created = await a.agent
    .post('/api/study-room/conversations')
    .set('X-CSRF-Token', a.csrfToken)
    .send({ participantUserId: String(studentB._id) });
  assert.equal(created.status, 201);
  const again = await a.agent
    .post('/api/study-room/conversations')
    .set('X-CSRF-Token', a.csrfToken)
    .send({ participantUserId: String(studentB._id) });
  assert.equal(again.body.data.id, created.body.data.id);
  const conversationId = created.body.data.id;
  const participantKey = [String(studentA._id), String(studentB._id)].sort().join(':');
  const key = await derivePrivateKey(alice.privateKey, bob.publicKey, conversationId, participantKey);
  const encryptedPayload = await encryptText(key, 'private-plain');
  const sent = await a.agent
    .post(`/api/study-room/conversations/${conversationId}/messages`)
    .set('X-CSRF-Token', a.csrfToken)
    .send({ clientMessageId: 'priv_msg_01', encryptedPayload });
  assert.equal(sent.status, 201);
  const outsider = await other.agent.get(`/api/study-room/conversations/${conversationId}/messages`);
  assert.equal(outsider.status, 404);
  const otherFolderProbe = await other.agent.get(`/api/study-room/folders/${created.body.data.id}`);
  assert.ok([404, 400].includes(otherFolderProbe.status));
  const crossBatch = await a.agent
    .post('/api/study-room/conversations')
    .set('X-CSRF-Token', a.csrfToken)
    .send({ participantUserId: String(studentOtherBatch._id) });
  assert.equal(crossBatch.status, 403);
});

dbTest('shared folder upload stays unavailable until scan+moderation allow it', async () => {
  await seed();
  const student = await login('a@example.test');
  const admin = await login('admin@example.test');
  const folder = await student.agent
    .post('/api/study-room/folders')
    .set('X-CSRF-Token', student.csrfToken)
    .send({ name: 'Notes' });
  assert.equal(folder.status, 201);
  const uploaded = await student.agent
    .post(`/api/study-room/folders/${folder.body.data.id}/resources`)
    .set('X-CSRF-Token', student.csrfToken)
    .field('title', 'Week notes')
    .attach('file', pdfBuffer, { filename: 'notes.pdf', contentType: 'application/pdf' });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.body.data.moderationState, 'PENDING_REVIEW');
  const blocked = await student.agent.get(`/api/study-room/resources/${uploaded.body.data.id}/download`);
  assert.equal(blocked.status, 404);
  const approved = await admin.agent
    .post(`/api/study-room/moderation/resources/${uploaded.body.data.id}/approve`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({});
  assert.equal(approved.status, 200);
  const download = await student.agent.get(`/api/study-room/resources/${uploaded.body.data.id}/download`);
  assert.equal(download.status, 200);
  const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
  const rejected = await student.agent
    .post(`/api/study-room/folders/${folder.body.data.id}/resources`)
    .set('X-CSRF-Token', student.csrfToken)
    .attach('file', exe, { filename: 'notes.pdf.exe', contentType: 'application/pdf' });
  assert.equal(rejected.status, 415);
  const lecturer = await login('lecturer@example.test');
  assert.equal((await lecturer.agent.get(`/api/study-room/folders/${folder.body.data.id}`)).status, 403);
  assert.equal((await student.agent.get('/api/study-room/moderation/settings')).status, 403);
  assert.equal((await admin.agent.get('/api/study-room/moderation/settings')).status, 200);
  assert.equal(await SharedResource.countDocuments({ folderId: folder.body.data.id }), 1);
});

dbTest('unconfigured scanner cannot make a student file available', async () => {
  await seed();
  const closedApp = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
    infrastructure: {
      storage: createFileStorage({ config, backendRoot: process.cwd() }),
      malwareScanner: { scan: async () => ({ clean: false, status: 'not_configured' }) },
      queue: { enqueue: async () => ({ id: 'scan' }) },
    },
  });
  const agent = request.agent(closedApp);
  const csrf = await agent.get('/api/auth/csrf');
  await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf.body.data.csrfToken)
    .send({ identifier: 'a@example.test', password: 'correcthorse' });
  const meCsrf = await agent.get('/api/auth/csrf');
  const folder = await agent
    .post('/api/study-room/folders')
    .set('X-CSRF-Token', meCsrf.body.data.csrfToken)
    .send({ name: 'Closed' });
  const uploaded = await agent
    .post(`/api/study-room/folders/${folder.body.data.id}/resources`)
    .set('X-CSRF-Token', meCsrf.body.data.csrfToken)
    .attach('file', pdfBuffer, { filename: 'notes.pdf', contentType: 'application/pdf' });
  assert.equal(uploaded.status, 201);
  assert.notEqual(uploaded.body.data.moderationState, 'AVAILABLE');
  const download = await agent.get(`/api/study-room/resources/${uploaded.body.data.id}/download`);
  assert.equal(download.status, 404);
});

dbTest('socket join is authorized and lecturers cannot connect to Study Room events', async () => {
  await seed();
  const student = await login('a@example.test');
  const access = await student.agent.get('/api/study-room/access');
  const conversationId = access.body.data.commonConversation.id;
  const address = httpServer.address();
  const cookie = (student.cookies || []).map((item) => String(item).split(';')[0]).join('; ');
  const studentSocket = Client(`http://127.0.0.1:${address.port}`, {
    extraHeaders: { Cookie: cookie },
    transports: ['websocket'],
    reconnection: false,
  });
  await new Promise((resolve, reject) => {
    studentSocket.on('connect', resolve);
    studentSocket.on('connect_error', reject);
    setTimeout(() => reject(new Error('student socket timeout')), 4000);
  });
  const joined = await new Promise((resolve) => {
    studentSocket.emit('study-room:join', { conversationId }, resolve);
  });
  assert.equal(joined.ok, true);
  studentSocket.close();

  const lecturer = await login('lecturer@example.test');
  const lecturerCookie = (lecturer.cookies || []).map((item) => String(item).split(';')[0]).join('; ');
  const lecturerSocket = Client(`http://127.0.0.1:${address.port}`, {
    extraHeaders: { Cookie: lecturerCookie },
    transports: ['websocket'],
    reconnection: false,
  });
  const lecturerError = await new Promise((resolve) => {
    lecturerSocket.on('connect_error', (error) => resolve(error.message));
    lecturerSocket.on('connect', () => resolve('connected'));
    setTimeout(() => resolve('timeout'), 4000);
  });
  assert.notEqual(lecturerError, 'connected');
  lecturerSocket.close();
});

dbTest('established Study Room sockets disconnect after logout or account disablement', async () => {
  const { studentA } = await seed();
  const student = await login('a@example.test');
  const access = await student.agent.get('/api/study-room/access');
  const conversationId = access.body.data.commonConversation.id;
  const address = httpServer.address();
  const cookie = (student.cookies || []).map((item) => String(item).split(';')[0]).join('; ');

  const logoutSocket = Client(`http://127.0.0.1:${address.port}`, {
    extraHeaders: { Cookie: cookie },
    transports: ['websocket'],
    reconnection: false,
  });
  await new Promise((resolve, reject) => {
    logoutSocket.on('connect', resolve);
    logoutSocket.on('connect_error', reject);
    setTimeout(() => reject(new Error('logout socket timeout')), 4000);
  });
  const joined = await new Promise((resolve) => {
    logoutSocket.emit('study-room:join', { conversationId }, resolve);
  });
  assert.equal(joined.ok, true);

  const disconnectedAfterLogout = new Promise((resolve) => {
    logoutSocket.on('disconnect', () => resolve(true));
    setTimeout(() => resolve(false), 4000);
  });
  const logout = await student.agent.post('/api/auth/logout').set('X-CSRF-Token', student.csrfToken);
  assert.equal(logout.status, 200);
  assert.equal(await disconnectedAfterLogout, true);

  const staleJoin = await new Promise((resolve) => {
    logoutSocket.emit('study-room:join', { conversationId }, (ack) => resolve(ack || { ok: false }));
    setTimeout(() => resolve({ ok: false, timeout: true }), 1500);
  });
  assert.notEqual(staleJoin.ok, true);
  logoutSocket.close();

  const stillActive = await login('a@example.test');
  const disableCookie = (stillActive.cookies || []).map((item) => String(item).split(';')[0]).join('; ');
  const disableSocket = Client(`http://127.0.0.1:${address.port}`, {
    extraHeaders: { Cookie: disableCookie },
    transports: ['websocket'],
    reconnection: false,
  });
  await new Promise((resolve, reject) => {
    disableSocket.on('connect', resolve);
    disableSocket.on('connect_error', reject);
    setTimeout(() => reject(new Error('disable socket timeout')), 4000);
  });
  const disableJoin = await new Promise((resolve) => {
    disableSocket.emit('study-room:join', { conversationId }, resolve);
  });
  assert.equal(disableJoin.ok, true);
  const disconnectedAfterDisable = new Promise((resolve) => {
    disableSocket.on('disconnect', () => resolve(true));
    setTimeout(() => resolve(false), 4000);
  });
  const admin = await login('admin@example.test');
  const suspended = await admin.agent
    .patch(`/api/auth/users/${studentA._id}/status`)
    .set('X-CSRF-Token', admin.csrfToken)
    .send({ accountStatus: 'SUSPENDED' });
  assert.equal(suspended.status, 200);
  assert.equal(await disconnectedAfterDisable, true);

  const afterDisable = await new Promise((resolve) => {
    disableSocket.emit('study-room:message', { conversationId, clientMessageId: 'after_disable_01' }, (ack) =>
      resolve(ack || { ok: false }),
    );
    setTimeout(() => resolve({ ok: false, timeout: true }), 1500);
  });
  assert.notEqual(afterDisable.ok, true);
  disableSocket.close();
});
