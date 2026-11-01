import assert from 'node:assert/strict';
import request from 'supertest';
import { after, before, beforeEach, test } from 'node:test';
import { clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { createAgentHarness, seedAgentWorld } from '../helpers/study-agent-fixtures.js';
import { StudyMessage, StudySession } from '../../src/modules/study-agent/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';

const harness = createAgentHarness();

before(() => harness.start());
after(() => harness.stop());
beforeEach(async () => {
  if (harness.ready) {
    await clearIsolatedMongo();
    harness.provider.calls.length = 0;
  }
});

function dbTest(name, fn) {
  test(name, async (t) => {
    if (!harness.ready) {
      t.skip('Isolated MongoDB is not available in this environment');
      return;
    }
    await fn(t);
  });
}

const ANY_ID = '000000000000000000000000';

const ENDPOINTS = [
  ['get', '/api/study-agent/access'],
  ['get', '/api/study-agent/subjects'],
  ['get', '/api/study-agent/sessions'],
  ['post', '/api/study-agent/sessions'],
  ['get', `/api/study-agent/sessions/${ANY_ID}`],
  ['patch', `/api/study-agent/sessions/${ANY_ID}`],
  ['delete', `/api/study-agent/sessions/${ANY_ID}`],
  ['post', `/api/study-agent/sessions/${ANY_ID}/messages`],
  ['get', `/api/study-agent/sessions/${ANY_ID}/sources`],
  ['post', `/api/study-agent/sessions/${ANY_ID}/attachments`],
  ['get', `/api/study-agent/attachments/${ANY_ID}`],
  ['get', `/api/study-agent/attachments/${ANY_ID}/content`],
  ['delete', `/api/study-agent/attachments/${ANY_ID}`],
];

async function createSession(student, offeringId) {
  const response = await student.agent
    .post('/api/study-agent/sessions')
    .set('X-CSRF-Token', student.csrfToken)
    .send({ mode: 'SUBJECT', offeringId: String(offeringId) });
  assert.equal(response.status, 201);
  return response.body.data;
}

dbTest('unauthenticated_requests_are_rejected_on_every_study_agent_route', async () => {
  await seedAgentWorld();
  for (const [method, url] of ENDPOINTS) {
    const response = await request(harness.app)[method](url).send({});
    assert.equal(response.status, 401, `${method} ${url}`);
  }
});

dbTest('lecturers_and_admins_are_forbidden_on_every_study_agent_route', async () => {
  await seedAgentWorld();
  for (const email of ['lecturer@example.test', 'admin@example.test']) {
    const user = await harness.login(email);
    for (const [method, url] of ENDPOINTS) {
      const response = await user.agent[method](url).set('X-CSRF-Token', user.csrfToken).send({});
      assert.equal(response.status, 403, `${email} ${method} ${url}`);
    }
  }
  assert.equal(harness.provider.calls.length, 0);
});

dbTest('mutations_without_a_csrf_token_are_rejected', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await createSession(a, world.offering._id);
  const noToken = [
    () => a.agent.post('/api/study-agent/sessions').send({ mode: 'FREE' }),
    () => a.agent.patch(`/api/study-agent/sessions/${session.id}`).send({ title: 'x' }),
    () => a.agent.delete(`/api/study-agent/sessions/${session.id}`),
    () => a.agent.post(`/api/study-agent/sessions/${session.id}/messages`).send({ content: 'hi' }),
  ];
  for (const send of noToken) {
    assert.equal((await send()).status, 403);
  }
  assert.equal(harness.provider.calls.length, 0);
  assert.equal((await StudySession.findById(session.id)).status, 'ACTIVE');
});

dbTest('a_student_cannot_read_write_rename_archive_or_list_sources_of_another_students_session', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const b = await harness.login('b@example.test');
  const session = await createSession(a, world.offering._id);
  await a.agent
    .post(`/api/study-agent/sessions/${session.id}/messages`)
    .set('X-CSRF-Token', a.csrfToken)
    .send({ content: 'private question about my weak topics' });
  harness.provider.calls.length = 0;

  const read = await b.agent.get(`/api/study-agent/sessions/${session.id}`);
  assert.equal(read.status, 404);
  assert.doesNotMatch(JSON.stringify(read.body), /private question/);

  const write = await b.agent
    .post(`/api/study-agent/sessions/${session.id}/messages`)
    .set('X-CSRF-Token', b.csrfToken)
    .send({ content: 'hijack' });
  assert.equal(write.status, 404);
  assert.equal(harness.provider.calls.length, 0);

  const rename = await b.agent
    .patch(`/api/study-agent/sessions/${session.id}`)
    .set('X-CSRF-Token', b.csrfToken)
    .send({ title: 'pwned' });
  assert.equal(rename.status, 404);

  assert.equal((await b.agent.delete(`/api/study-agent/sessions/${session.id}`).set('X-CSRF-Token', b.csrfToken)).status, 404);
  assert.equal((await b.agent.get(`/api/study-agent/sessions/${session.id}/sources`)).status, 404);

  const listed = await b.agent.get('/api/study-agent/sessions');
  assert.deepEqual(listed.body.data.items, []);

  const untouched = await StudySession.findById(session.id);
  assert.equal(untouched.status, 'ACTIVE');
  assert.notEqual(untouched.title, 'pwned');
  assert.equal(await StudyMessage.countDocuments({ sessionId: session.id, studentUserId: world.studentB._id }), 0);
});

dbTest('unknown_and_archived_session_ids_are_indistinguishable_from_foreign_ones', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await createSession(a, world.offering._id);
  await a.agent.delete(`/api/study-agent/sessions/${session.id}`).set('X-CSRF-Token', a.csrfToken);
  const archived = await a.agent.get(`/api/study-agent/sessions/${session.id}`);
  const unknown = await a.agent.get(`/api/study-agent/sessions/${ANY_ID}`);
  assert.equal(archived.status, 404);
  assert.deepEqual(archived.body.error.message, unknown.body.error.message);
});

dbTest('malformed_ids_and_operator_injection_are_rejected_not_executed', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  assert.equal((await a.agent.get('/api/study-agent/sessions/not-an-id')).status, 400);
  assert.equal((await a.agent.get(`/api/study-agent/sessions/${ANY_ID}?before=zzz`)).status, 404);

  const injected = await a.agent
    .post('/api/study-agent/sessions')
    .set('X-CSRF-Token', a.csrfToken)
    .send({ mode: 'SUBJECT', offeringId: { $ne: null } });
  assert.equal(injected.status, 400);

  const session = await createSession(a, world.offering._id);
  const badCursor = await a.agent.get(`/api/study-agent/sessions/${session.id}?before=zzz`);
  assert.equal(badCursor.status, 400);
  assert.equal((await a.agent.get('/api/study-agent/sessions?limit=-5')).status, 400);
});

dbTest('a_student_cannot_start_a_session_on_a_subject_from_another_batch', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const response = await a.agent
    .post('/api/study-agent/sessions')
    .set('X-CSRF-Token', a.csrfToken)
    .send({ mode: 'SUBJECT', offeringId: String(world.otherOffering._id) });
  assert.equal(response.status, 404);
  assert.equal(await StudySession.countDocuments({}), 0);
});

dbTest('a_student_without_an_academic_context_cannot_use_the_agent', async () => {
  await seedAgentWorld();
  const none = await harness.login('nocontext@example.test');
  const response = await none.agent
    .post('/api/study-agent/sessions')
    .set('X-CSRF-Token', none.csrfToken)
    .send({ mode: 'FREE' });
  assert.equal(response.status, 403);
});

dbTest('agent_replies_and_errors_never_expose_provider_internals_or_storage_keys', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await createSession(a, world.offering._id);
  harness.provider.reply = () => {
    throw new Error('GEMINI_API_KEY=secret-value leaked in upstream error');
  };
  const response = await a.agent
    .post(`/api/study-agent/sessions/${session.id}/messages`)
    .set('X-CSRF-Token', a.csrfToken)
    .send({ content: 'hello' });
  harness.provider.reply = undefined;
  assert.ok(response.status >= 500);
  assert.doesNotMatch(JSON.stringify(response.body), /secret-value|GEMINI_API_KEY|stack/i);
});

test('logger_redacts_prompts_completions_document_text_and_ai_keys', () => {
  const lines = [];
  const original = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  const capture = (chunk) => {
    lines.push(String(chunk));
    return true;
  };
  process.stdout.write = capture;
  process.stderr.write = capture;
  try {
    const logger = createLogger({ service: 'test', level: 'debug' });
    logger.error('probe', {
      prompt: 'student asked about their failing grade',
      completion: 'model said something',
      documentText: 'lecture body',
      messageText: 'hello',
      answers: { q1: 'secret answer' },
      geminiApiKey: 'AIza-secret',
    });
  } finally {
    process.stdout.write = original;
    process.stderr.write = originalErr;
  }
  const output = lines.join('');
  assert.match(output, /probe/);
  for (const leaked of ['failing grade', 'model said', 'lecture body', 'secret answer', 'AIza-secret']) {
    assert.equal(output.includes(leaked), false, `${leaked} must be redacted`);
  }
});
