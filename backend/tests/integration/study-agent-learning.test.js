import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { createAgentHarness, createOfficialResource, seedAgentWorld } from '../helpers/study-agent-fixtures.js';
import { StoredFile } from '../../src/modules/files/index.js';
import { StudyMessage, StudySession, indexFile, enqueueIndexAfterScan, syncUploadAfterScan } from '../../src/modules/study-agent/index.js';
import { resetMinuteLimits } from '../../src/modules/study-agent/services/usage.service.js';

const harness = createAgentHarness();

before(() => harness.start());
after(() => harness.stop());
beforeEach(async () => {
  if (harness.ready) {
    await clearIsolatedMongo();
    harness.provider.calls.length = 0;
    harness.provider.reply = undefined;
    harness.provider.configured = true;
    harness.enqueued.length = 0;
    harness.config.studyAgent.messagesPerMinute = 1000;
    harness.config.studyAgent.dailyRequests = 100_000;
    harness.config.studyAgent.imageMaxBytes = 5 * 1024 * 1024;
    harness.config.studyAgent.maxImages = 5;
    resetMinuteLimits();
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

const PNG = Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG\r\n\x1a\n'), Buffer.alloc(64, 7)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 3)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 1)]);

async function pdfWithText(text) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage();
  page.drawText(text, { x: 40, y: 700, size: 12, font });
  return Buffer.from(await doc.save());
}

async function startSession(student, body) {
  const response = await student.agent
    .post('/api/study-agent/sessions')
    .set('X-CSRF-Token', student.csrfToken)
    .send(body);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}

function upload(student, sessionId, files) {
  let req = student.agent.post(`/api/study-agent/sessions/${sessionId}/attachments`).set('X-CSRF-Token', student.csrfToken);
  for (const file of files) {
    req = req.attach('files', file.buffer, { filename: file.name, contentType: file.type });
  }
  return req;
}

function ask(student, sessionId, body) {
  return student.agent
    .post(`/api/study-agent/sessions/${sessionId}/messages`)
    .set('X-CSRF-Token', student.csrfToken)
    .send(body);
}

async function makeReady(fileId) {
  await StoredFile.updateOne({ _id: fileId }, { scanStatus: 'SAFE' });
  await syncUploadAfterScan(fileId);
}

const png = (name = 'question.png') => ({ buffer: PNG, name, type: 'image/png' });

dbTest('uploads_are_stored_privately_queued_for_scanning_and_not_usable_until_clean', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSession(a, { mode: 'FREE' });
  const pdf = await pdfWithText('Lecture notes');
  const response = await upload(a, session.id, [png(), { buffer: pdf, name: 'notes.pdf', type: 'application/pdf' }]);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.deepEqual(response.body.data.items.map((item) => [item.name, item.mimeType, item.status]), [
    ['question.png', 'image/png', 'SCANNING'],
    ['notes.pdf', 'application/pdf', 'SCANNING'],
  ]);
  assert.equal(harness.enqueued.filter((job) => job.name === 'files.malware-scan').length, 2);

  const rows = await StoredFile.find({ owningDomain: 'STUDY_AGENT_UPLOAD' });
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(String(row.uploadedByUserId), String(world.studentA._id));
    assert.equal(String(row.owningContextId), session.id);
    assert.equal(row.availability, 'UNAVAILABLE');
    assert.match(row.storageKey, new RegExp(`^study-agent/${world.studentA._id}/`));
  }

  const unready = await ask(a, session.id, { content: 'Solve this', attachmentIds: [response.body.data.items[0].id] });
  assert.equal(unready.status, 400);
  assert.match(unready.body.error.message, /not ready/);
  assert.equal(harness.provider.calls.length, 0);
});

dbTest('upload_validation_rejects_disguised_wrong_oversized_empty_and_too_many_files_without_storing_any', async () => {
  await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSession(a, { mode: 'FREE' });

  const disguised = await upload(a, session.id, [png(), { buffer: EXE, name: 'photo.png', type: 'image/png' }]);
  assert.equal(disguised.status, 415);
  const binaryAsText = await upload(a, session.id, [{ buffer: Buffer.from([104, 0, 105, 0]), name: 'a.txt', type: 'text/plain' }]);
  assert.equal(binaryAsText.status, 415);
  const office = await upload(a, session.id, [{ buffer: Buffer.from('PKzip'), name: 'a.txt', type: 'text/plain' }]);
  assert.equal(office.status, 415);
  const executableName = await upload(a, session.id, [{ buffer: PNG, name: 'run.exe', type: 'image/png' }]);
  assert.equal(executableName.status, 415);
  const empty = await upload(a, session.id, [{ buffer: Buffer.alloc(0), name: 'empty.png', type: 'image/png' }]);
  assert.equal(empty.status, 400);

  harness.config.studyAgent.imageMaxBytes = 100;
  const big = await upload(a, session.id, [{ buffer: Buffer.concat([PNG, Buffer.alloc(500)]), name: 'big.png', type: 'image/png' }]);
  assert.equal(big.status, 413);
  harness.config.studyAgent.imageMaxBytes = 5 * 1024 * 1024;

  harness.config.studyAgent.maxImages = 2;
  const many = await upload(a, session.id, [png('1.png'), png('2.png'), png('3.png')]);
  assert.equal(many.status, 400);

  const none = await a.agent
    .post(`/api/study-agent/sessions/${session.id}/attachments`)
    .set('X-CSRF-Token', a.csrfToken)
    .send({});
  assert.equal(none.status, 400);

  assert.equal(await StoredFile.countDocuments({ owningDomain: 'STUDY_AGENT_UPLOAD' }), 0);
  assert.equal(harness.enqueued.length, 0);
});

dbTest('attachment_status_follows_the_scan_result', async () => {
  await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSession(a, { mode: 'FREE' });
  const created = await upload(a, session.id, [png('ok.png'), png('bad.png'), png('unverified.png')]);
  const [ok, bad, unverified] = created.body.data.items;

  await StoredFile.updateOne({ _id: ok.id }, { scanStatus: 'SAFE' });
  assert.equal((await a.agent.get(`/api/study-agent/attachments/${ok.id}`)).body.data.status, 'SCANNING');
  await syncUploadAfterScan(ok.id);
  assert.equal((await a.agent.get(`/api/study-agent/attachments/${ok.id}`)).body.data.status, 'READY');

  await StoredFile.updateOne({ _id: bad.id }, { scanStatus: 'UNSAFE' });
  await syncUploadAfterScan(bad.id);
  assert.equal((await a.agent.get(`/api/study-agent/attachments/${bad.id}`)).body.data.status, 'BLOCKED');
  await StoredFile.updateOne({ _id: unverified.id }, { scanStatus: 'QUARANTINED' });
  assert.equal((await a.agent.get(`/api/study-agent/attachments/${unverified.id}`)).body.data.status, 'BLOCKED');
  assert.equal((await StoredFile.findById(bad.id)).availability, 'UNAVAILABLE');
});

dbTest('scan_hook_only_touches_study_agent_uploads', async () => {
  const world = await seedAgentWorld();
  const official = await createOfficialResource(harness, world, { title: 'Lecture', text: 'content', availability: 'UNAVAILABLE' });
  assert.equal(await syncUploadAfterScan(official.file._id), false);
  assert.equal((await StoredFile.findById(official.file._id)).availability, 'UNAVAILABLE');

  const a = await harness.login('a@example.test');
  const session = await startSession(a, { mode: 'FREE' });
  const pdf = await pdfWithText('Notes');
  const created = await upload(a, session.id, [{ buffer: pdf, name: 'n.pdf', type: 'application/pdf' }]);
  const id = created.body.data.items[0].id;
  assert.equal(await enqueueIndexAfterScan({ queue: harness.infrastructure.queue, fileId: id }), false);
  await makeReady(id);
  assert.equal(await enqueueIndexAfterScan({ queue: harness.infrastructure.queue, fileId: id }), true);
});

dbTest('attachment_content_is_owner_only_private_and_served_with_safe_headers', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const b = await harness.login('b@example.test');
  const lecturer = await harness.login('lecturer@example.test');
  const session = await startSession(a, { mode: 'FREE' });
  const pdf = await pdfWithText('Notes');
  const created = await upload(a, session.id, [png(), { buffer: pdf, name: 'notes.pdf', type: 'application/pdf' }]);
  const [image, doc] = created.body.data.items;

  assert.equal((await a.agent.get(`/api/study-agent/attachments/${image.id}/content`)).status, 404);
  await makeReady(image.id);
  await makeReady(doc.id);

  const img = await a.agent.get(`/api/study-agent/attachments/${image.id}/content`);
  assert.equal(img.status, 200);
  assert.equal(img.headers['content-type'], 'image/png');
  assert.equal(img.headers['x-content-type-options'], 'nosniff');
  assert.match(img.headers['cache-control'], /private/);
  assert.match(img.headers['cache-control'], /no-store/);
  assert.match(img.headers['content-disposition'], /^inline/);
  assert.deepEqual(img.body, PNG);

  const pdfResponse = await a.agent.get(`/api/study-agent/attachments/${doc.id}/content`);
  assert.match(pdfResponse.headers['content-disposition'], /^attachment/);

  for (const path of [`/api/study-agent/attachments/${image.id}`, `/api/study-agent/attachments/${image.id}/content`]) {
    assert.equal((await b.agent.get(path)).status, 404, `student B ${path}`);
    assert.equal((await lecturer.agent.get(path)).status, 403, `lecturer ${path}`);
  }
  assert.equal((await b.agent.delete(`/api/study-agent/attachments/${image.id}`).set('X-CSRF-Token', b.csrfToken)).status, 404);
  assert.equal((await StoredFile.findById(image.id)).availability, 'AVAILABLE');
  assert.ok(world);
});

dbTest('another_students_or_another_sessions_attachment_cannot_be_used_in_a_message', async () => {
  await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const b = await harness.login('b@example.test');
  const sessionA1 = await startSession(a, { mode: 'FREE' });
  const sessionA2 = await startSession(a, { mode: 'FREE' });
  const sessionB = await startSession(b, { mode: 'FREE' });
  const created = await upload(a, sessionA1.id, [png()]);
  const id = created.body.data.items[0].id;
  await makeReady(id);

  assert.equal((await ask(b, sessionB.id, { content: 'steal', attachmentIds: [id] })).status, 404);
  assert.equal((await ask(a, sessionA2.id, { content: 'wrong session', attachmentIds: [id] })).status, 404);
  assert.equal((await upload(b, sessionA1.id, [png()])).status, 404);
  assert.equal(harness.provider.calls.length, 0);

  assert.equal((await ask(a, sessionA1.id, { content: 'mine', attachmentIds: [id] })).status, 201);
});

dbTest('attachment_ids_are_validated_and_removed_attachments_cannot_be_sent', async () => {
  await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSession(a, { mode: 'FREE' });
  const created = await upload(a, session.id, [png('1.png'), png('2.png')]);
  const [first, second] = created.body.data.items;
  await makeReady(first.id);
  await makeReady(second.id);

  assert.equal((await ask(a, session.id, { content: 'x', attachmentIds: 'abc' })).status, 400);
  assert.equal((await ask(a, session.id, { content: 'x', attachmentIds: [{ $ne: null }] })).status, 400);
  assert.equal((await ask(a, session.id, { content: 'x', attachmentIds: ['not-an-id'] })).status, 400);
  harness.config.studyAgent.maxImages = 1;
  assert.equal((await ask(a, session.id, { content: 'x', attachmentIds: [first.id, second.id] })).status, 400);
  harness.config.studyAgent.maxImages = 5;

  assert.equal((await a.agent.delete(`/api/study-agent/attachments/${first.id}`).set('X-CSRF-Token', a.csrfToken)).status, 200);
  assert.equal((await ask(a, session.id, { content: 'x', attachmentIds: [first.id] })).status, 400);
  assert.equal(harness.provider.calls.length, 0);
});

dbTest('photo_of_a_question_is_sent_to_the_model_and_the_reply_credits_the_upload', async () => {
  await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSession(a, { mode: 'FREE' });
  const created = await upload(a, session.id, [png('exam-q3.png'), { buffer: JPEG, name: 'q4.jpg', type: 'image/jpeg' }]);
  const [first, second] = created.body.data.items;
  await makeReady(first.id);
  await makeReady(second.id);

  const response = await ask(a, session.id, { content: '', attachmentIds: [first.id, second.id] });
  assert.equal(response.status, 201, JSON.stringify(response.body));

  const call = harness.provider.calls[0];
  assert.deepEqual(call.parts, [
    { mimeType: 'image/png', data: PNG.toString('base64') },
    { mimeType: 'image/jpeg', data: JPEG.toString('base64') },
  ]);
  assert.match(call.system, /exam or assignment question/);
  assert.match(call.messages.at(-1).text, /solve any question in it step by step/);

  const { userMessage, agentMessage } = response.body.data;
  assert.deepEqual(userMessage.attachments.map((item) => [item.name, item.mimeType]), [
    ['exam-q3.png', 'image/png'],
    ['q4.jpg', 'image/jpeg'],
  ]);
  assert.deepEqual(agentMessage.sources.map((source) => source.kind), ['UPLOAD', 'UPLOAD']);

  const history = await a.agent.get(`/api/study-agent/sessions/${session.id}`);
  assert.equal(history.body.data.messages[0].attachments.length, 2);
});

dbTest('empty_messages_without_attachments_are_still_rejected', async () => {
  await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSession(a, { mode: 'FREE' });
  assert.equal((await ask(a, session.id, { content: '' })).status, 400);
  assert.equal((await ask(a, session.id, { content: '  ', attachmentIds: [] })).status, 400);
});

dbTest('uploaded_pdf_is_indexed_and_cited_only_inside_its_own_session', async () => {
  await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const b = await harness.login('b@example.test');
  const session = await startSession(a, { mode: 'FREE' });
  const otherSession = await startSession(a, { mode: 'FREE' });
  const sessionB = await startSession(b, { mode: 'FREE' });
  const pdf = await pdfWithText('Hashing maps keys to buckets using a hash function.');
  const created = await upload(a, session.id, [{ buffer: pdf, name: 'my-notes.pdf', type: 'application/pdf' }]);
  const id = created.body.data.items[0].id;
  await makeReady(id);
  assert.equal((await indexFile({ fileId: id, infrastructure: harness.infrastructure })).status, 'INDEXED');

  harness.provider.reply = () => ({ text: 'Keys go into buckets [S1].', json: null, citations: [], usage: {} });
  const response = await ask(a, session.id, { content: 'how does the hash function pick buckets' });
  assert.equal(response.status, 201);
  assert.match(harness.provider.calls[0].messages.at(-1).text, /Hashing maps keys to buckets/);
  assert.equal(response.body.data.agentMessage.sources[0].kind, 'UPLOAD');
  assert.equal(response.body.data.agentMessage.sources[0].title, 'my-notes.pdf');
  assert.equal(response.body.data.agentMessage.sources[0].page, 1);

  harness.provider.calls.length = 0;
  await ask(a, otherSession.id, { content: 'how does the hash function pick buckets' });
  await ask(b, sessionB.id, { content: 'how does the hash function pick buckets' });
  for (const call of harness.provider.calls) {
    assert.doesNotMatch(JSON.stringify(call.messages), /Hashing maps keys/);
  }
});

dbTest('removed_or_unsafe_uploads_drop_out_of_retrieval_even_if_indexed', async () => {
  await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSession(a, { mode: 'FREE' });
  const pdf = await pdfWithText('Tombstone marker phrase about linked lists.');
  const created = await upload(a, session.id, [{ buffer: pdf, name: 'l.pdf', type: 'application/pdf' }]);
  const id = created.body.data.items[0].id;
  await makeReady(id);
  await indexFile({ fileId: id, infrastructure: harness.infrastructure });

  await a.agent.delete(`/api/study-agent/attachments/${id}`).set('X-CSRF-Token', a.csrfToken);
  await ask(a, session.id, { content: 'tombstone marker phrase' });
  assert.doesNotMatch(JSON.stringify(harness.provider.calls[0].messages), /Tombstone marker/);

  await StoredFile.updateOne({ _id: id }, { availability: 'AVAILABLE', scanStatus: 'UNSAFE' });
  harness.provider.calls.length = 0;
  await ask(a, session.id, { content: 'tombstone marker phrase' });
  assert.doesNotMatch(JSON.stringify(harness.provider.calls[0].messages), /Tombstone marker/);
});

dbTest('explanation_modes_shape_the_prompt_and_follow_ups_search_the_earlier_topic', async () => {
  const world = await seedAgentWorld();
  const { file } = await createOfficialResource(harness, world, {
    title: 'Lecture 3',
    text: '1 Normalization\nNormalization reduces redundancy in relational databases and improves integrity.',
  });
  await indexFile({ fileId: file._id, infrastructure: harness.infrastructure });
  const a = await harness.login('a@example.test');
  const session = await startSession(a, { mode: 'SUBJECT', offeringId: String(world.offering._id) });

  await ask(a, session.id, { content: 'what is normalization' });
  harness.provider.calls.length = 0;

  const simpler = await ask(a, session.id, { content: 'I do not get it, make it easier', intent: 'simpler' });
  assert.equal(simpler.status, 201);
  assert.match(harness.provider.calls[0].system, /shorter sentences/);
  assert.match(harness.provider.calls[0].messages.at(-1).text, /reduces redundancy/);

  await ask(a, session.id, { content: 'show me', intent: 'example' });
  assert.match(harness.provider.calls[1].system, /worked examples/);
  await ask(a, session.id, { content: 'versus denormalization', intent: 'compare' });
  assert.match(harness.provider.calls[2].system, /side by side/);
  await ask(a, session.id, { content: 'in tamil please', intent: 'tamil' });
  assert.match(harness.provider.calls[3].system, /Reply entirely in Tamil/);

  assert.equal((await ask(a, session.id, { content: 'hi', intent: 'hack' })).status, 400);
  assert.equal((await ask(a, session.id, { content: 'hi', intent: { $ne: 1 } })).status, 400);
});

dbTest('web_research_is_used_for_free_study_or_on_request_and_only_https_citations_are_kept', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const free = await startSession(a, { mode: 'FREE' });
  const subject = await startSession(a, { mode: 'SUBJECT', offeringId: String(world.offering._id) });

  harness.provider.reply = () => ({
    text: 'Transformers use attention.',
    json: null,
    citations: [
      { title: 'Attention paper', uri: 'https://arxiv.org/abs/1706.03762' },
      { title: 'Duplicate', uri: 'https://arxiv.org/abs/1706.03762' },
      { title: 'Insecure', uri: 'http://example.com/plain' },
      { title: 'Script', uri: 'javascript:alert(1)' },
      { title: 'Data', uri: 'data:text/html,<script>1</script>' },
      { title: 'Broken', uri: 'not a url' },
    ],
    usage: {},
  });

  const response = await ask(a, free.id, { content: 'How do transformers work?' });
  assert.equal(response.status, 201);
  assert.equal(harness.provider.calls[0].webSearch, true);
  assert.match(harness.provider.calls[0].system, /web search/i);
  assert.deepEqual(response.body.data.agentMessage.sources, [
    { kind: 'WEB', title: 'Attention paper', fileId: null, page: null, section: null, url: 'https://arxiv.org/abs/1706.03762' },
  ]);

  harness.provider.calls.length = 0;
  await ask(a, subject.id, { content: 'What is a primary key?' });
  assert.equal(harness.provider.calls[0].webSearch, false);
  await ask(a, subject.id, { content: 'Latest SQL standard changes', intent: 'research' });
  assert.equal(harness.provider.calls[1].webSearch, true);
  assert.match(harness.provider.calls[1].system, /reputable sources/);
});

dbTest('rolling_summary_is_refreshed_every_ten_messages_and_used_in_later_prompts', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSession(a, { mode: 'SUBJECT', offeringId: String(world.offering._id) });
  harness.provider.reply = (input) => ({
    text: input.system.includes('running summary') ? 'Student is learning keys and joins.' : 'Answer.',
    json: null,
    citations: [],
    usage: {},
  });

  for (let i = 1; i <= 5; i += 1) {
    assert.equal((await ask(a, session.id, { content: `question ${i}` })).status, 201);
  }
  const summaryCalls = harness.provider.calls.filter((call) => call.system.includes('running summary'));
  assert.equal(summaryCalls.length, 1);
  assert.match(summaryCalls[0].messages[0].text, /question 5/);
  assert.equal((await StudySession.findById(session.id)).rollingSummary, 'Student is learning keys and joins.');

  harness.provider.calls.length = 0;
  await ask(a, session.id, { content: 'question 6' });
  assert.match(harness.provider.calls[0].system, /Student is learning keys and joins\./);
});

dbTest('a_failing_summary_never_fails_the_reply_and_keeps_the_old_summary', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSession(a, { mode: 'SUBJECT', offeringId: String(world.offering._id) });
  await StudySession.updateOne({ _id: session.id }, { rollingSummary: 'Old summary' });
  harness.provider.reply = (input) => {
    if (input.system.includes('running summary')) {
      throw new Error('summary provider down');
    }
    return { text: 'Answer.', json: null, citations: [], usage: {} };
  };
  for (let i = 1; i <= 5; i += 1) {
    assert.equal((await ask(a, session.id, { content: `q${i}` })).status, 201);
  }
  assert.equal((await StudySession.findById(session.id)).rollingSummary, 'Old summary');
  assert.equal(await StudyMessage.countDocuments({ sessionId: session.id }), 10);
});

dbTest('upload_endpoint_respects_the_session_attachment_cap', async () => {
  await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSession(a, { mode: 'FREE' });
  const owner = (await StudySession.findById(session.id)).studentUserId;
  const docs = Array.from({ length: 50 }, (_, i) => ({
    storageKey: `cap/${i}`,
    originalFilename: `f${i}.png`,
    displayFilename: `f${i}.png`,
    mimeType: 'image/png',
    sizeBytes: 10,
    uploadedByUserId: owner,
    owningDomain: 'STUDY_AGENT_UPLOAD',
    owningContextId: session.id,
  }));
  await StoredFile.insertMany(docs);
  const response = await upload(a, session.id, [png()]);
  assert.equal(response.status, 400);
  assert.match(response.body.error.message, /attachment limit/);
});
