import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { clearIsolatedMongo } from '../helpers/memory-mongo.js';
import {
  createAgentHarness,
  createOfficialResource,
  createSharedResource,
  seedAgentWorld,
} from '../helpers/study-agent-fixtures.js';
import { AiProviderError } from '../../src/infrastructure/providers/ai-provider.js';
import { StudyMessage, StudySession, DocumentChunk, DocumentIndex } from '../../src/modules/study-agent/index.js';
import { indexFile, enqueueIndexAfterScan } from '../../src/modules/study-agent/index.js';
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

const LECTURE_TEXT = [
  '1 Normalization',
  'Normalization is the process of organising a relational database to reduce redundancy and improve integrity.',
  'First normal form requires atomic column values and a primary key for every table.',
].join('\n');

async function startSubjectSession(student, offeringId) {
  const response = await student.agent
    .post('/api/study-agent/sessions')
    .set('X-CSRF-Token', student.csrfToken)
    .send({ mode: 'SUBJECT', offeringId: String(offeringId) });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}

async function ask(student, sessionId, content) {
  return student.agent
    .post(`/api/study-agent/sessions/${sessionId}/messages`)
    .set('X-CSRF-Token', student.csrfToken)
    .send({ content });
}

dbTest('subjects_lists_only_the_students_current_offerings', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const response = await a.agent.get('/api/study-agent/subjects');
  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.data.items.map((item) => [item.offeringId, item.subjectCode]),
    [[String(world.offering._id), 'ICT101']],
  );
  const other = await harness.login('other@example.test');
  const otherResponse = await other.agent.get('/api/study-agent/subjects');
  assert.deepEqual(otherResponse.body.data.items.map((item) => item.subjectCode), ['ICT909']);
});

dbTest('access_requires_an_active_academic_context', async () => {
  await seedAgentWorld();
  const a = await harness.login('a@example.test');
  assert.equal((await a.agent.get('/api/study-agent/access')).status, 200);
  const none = await harness.login('nocontext@example.test');
  assert.equal((await none.agent.get('/api/study-agent/access')).status, 403);
});

dbTest('sessions_can_be_created_for_own_subjects_and_free_study_only', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const subjectSession = await startSubjectSession(a, world.offering._id);
  assert.equal(subjectSession.subjectCode, 'ICT101');
  assert.equal(subjectSession.title, 'New study session');
  assert.equal(subjectSession.subjectName, 'Database Systems');

  const foreign = await a.agent
    .post('/api/study-agent/sessions')
    .set('X-CSRF-Token', a.csrfToken)
    .send({ mode: 'SUBJECT', offeringId: String(world.otherOffering._id) });
  assert.equal(foreign.status, 404);

  const free = await a.agent
    .post('/api/study-agent/sessions')
    .set('X-CSRF-Token', a.csrfToken)
    .send({ mode: 'FREE', topic: 'Quantum computing basics' });
  assert.equal(free.status, 201);
  assert.equal(free.body.data.mode, 'FREE');
  assert.equal(free.body.data.title, 'Quantum computing basics');

  const bad = await a.agent
    .post('/api/study-agent/sessions')
    .set('X-CSRF-Token', a.csrfToken)
    .send({ mode: 'NOPE' });
  assert.equal(bad.status, 400);
});

dbTest('tutor_answers_from_official_material_with_page_and_section_sources', async () => {
  const world = await seedAgentWorld();
  const { file } = await createOfficialResource(harness, world, { title: 'Lecture 3 Normalization', text: LECTURE_TEXT });
  assert.equal((await indexFile({ fileId: file._id, infrastructure: harness.infrastructure })).status, 'INDEXED');

  harness.provider.reply = () => ({
    text: 'Normalization reduces redundancy [S1]. Can you name the first normal form rule?',
    json: null,
    citations: [],
    usage: { inputTokens: 40, outputTokens: 12 },
  });

  const a = await harness.login('a@example.test');
  const session = await startSubjectSession(a, world.offering._id);
  const response = await ask(a, session.id, 'Explain normalization to me');
  assert.equal(response.status, 201, JSON.stringify(response.body));

  const { agentMessage, userMessage } = response.body.data;
  assert.equal(userMessage.role, 'student');
  assert.equal(agentMessage.role, 'agent');
  assert.equal(agentMessage.sources.length, 1);
  assert.equal(agentMessage.sources[0].kind, 'OFFICIAL');
  assert.equal(agentMessage.sources[0].title, 'Lecture 3 Normalization');
  assert.equal(agentMessage.sources[0].page, 1);
  assert.equal(agentMessage.sources[0].section, '1 Normalization');

  const call = harness.provider.calls[0];
  const lastTurn = call.messages.at(-1).text;
  assert.match(lastTurn, /<untrusted_document>/);
  assert.match(lastTurn, /reduce redundancy/);
  assert.match(call.system, /ICT101 Database Systems/);

  const detail = await a.agent.get(`/api/study-agent/sessions/${session.id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.data.messages.map((message) => message.role), ['student', 'agent']);
  assert.equal(detail.body.data.session.messageCount, 2);
  assert.equal(detail.body.data.session.title, 'Explain normalization to me');
});

dbTest('reply_without_citations_is_labelled_as_general_ai_knowledge', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSubjectSession(a, world.offering._id);
  const response = await ask(a, session.id, 'What is a database?');
  assert.equal(response.status, 201);
  assert.deepEqual(response.body.data.agentMessage.sources, []);
});

dbTest('batch_shared_resources_are_used_and_labelled_shared', async () => {
  const world = await seedAgentWorld();
  const { file } = await createSharedResource(harness, world, {
    title: 'Classmate notes',
    text: 'Transactions guarantee atomicity consistency isolation and durability in a database.',
  });
  await indexFile({ fileId: file._id, infrastructure: harness.infrastructure });
  harness.provider.reply = () => ({ text: 'ACID properties are explained [S1].', json: null, citations: [], usage: {} });

  const b = await harness.login('b@example.test');
  const session = await startSubjectSession(b, world.offering._id);
  const response = await ask(b, session.id, 'What does durability mean in transactions?');
  assert.equal(response.status, 201);
  assert.equal(response.body.data.agentMessage.sources[0].kind, 'SHARED');
  assert.equal(response.body.data.agentMessage.sources[0].title, 'Classmate notes');
});

dbTest('other_batch_shared_resources_never_reach_the_prompt', async () => {
  const world = await seedAgentWorld();
  const { file } = await createSharedResource(harness, world, {
    title: 'Batch 22 only',
    text: 'Zebrafish hatchery protocol belongs to batch twenty two only.',
  });
  await indexFile({ fileId: file._id, infrastructure: harness.infrastructure });
  await createOfficialResource(harness, world, {
    title: 'Other lecture',
    text: 'Unrelated content about networking.',
    offering: world.otherOffering,
  });
  const other = await harness.login('other@example.test');
  const session = await startSubjectSession(other, world.otherOffering._id);
  const response = await ask(other, session.id, 'hatchery protocol');
  assert.equal(response.status, 201);
  for (const call of harness.provider.calls) {
    assert.doesNotMatch(JSON.stringify(call.messages), /Zebrafish/i);
  }
});

dbTest('unsafe_unpublished_removed_and_unavailable_files_never_enter_context', async () => {
  const world = await seedAgentWorld();
  const secret = 'Quokka confidential marker';
  const quarantined = await createOfficialResource(harness, world, { title: 'Quarantined', text: secret, scanStatus: 'QUARANTINED' });
  const unsafe = await createOfficialResource(harness, world, { title: 'Unsafe', text: secret, scanStatus: 'UNSAFE' });
  const draft = await createOfficialResource(harness, world, { title: 'Draft', text: secret, publicationState: 'DRAFT' });
  const unpublished = await createOfficialResource(harness, world, { title: 'Unpublished', text: secret, publicationState: 'UNPUBLISHED' });
  const deleted = await createOfficialResource(harness, world, { title: 'Deleted', text: secret, deletedAt: new Date() });
  const unavailable = await createOfficialResource(harness, world, { title: 'Unavailable', text: secret, availability: 'UNAVAILABLE' });
  const removedShared = await createSharedResource(harness, world, { title: 'Removed shared', text: secret, moderationState: 'REMOVED' });
  const pendingShared = await createSharedResource(harness, world, { title: 'Pending shared', text: secret, moderationState: 'PENDING_REVIEW' });
  const quarantinedShared = await createSharedResource(harness, world, { title: 'Quarantined shared', text: secret, scanStatus: 'QUARANTINED' });

  // indexFile refuses non-SAFE files, so force chunks to exist as if they had been indexed earlier.
  const all = [quarantined, unsafe, draft, unpublished, deleted, unavailable, removedShared, pendingShared, quarantinedShared];
  const refused = await indexFile({ fileId: quarantined.file._id, infrastructure: harness.infrastructure });
  assert.equal(refused.status, 'SKIPPED');
  for (const { file } of all) {
    await DocumentChunk.create({ fileId: file._id, page: 1, heading: '', ordinal: 0, text: secret });
  }

  // Positive control: a legitimate document that matches the same query must still be retrieved.
  const good = await createOfficialResource(harness, world, { title: 'Good guide', text: 'Public guide on confidential marker handling.' });
  await indexFile({ fileId: good.file._id, infrastructure: harness.infrastructure });

  const a = await harness.login('a@example.test');
  const session = await startSubjectSession(a, world.offering._id);
  const response = await ask(a, session.id, 'confidential marker');
  assert.equal(response.status, 201);
  assert.equal(harness.provider.calls.length, 1);
  const prompt = JSON.stringify(harness.provider.calls[0].messages);
  assert.match(prompt, /Public guide/);
  assert.doesNotMatch(prompt, /Quokka/i);

  const sources = await a.agent.get(`/api/study-agent/sessions/${session.id}/sources`);
  assert.equal(sources.status, 200);
  assert.deepEqual(sources.body.data.items.map((item) => item.title), ['Good guide']);
});

dbTest('sources_endpoint_reports_index_status_and_backfill_enqueues_missing_files', async () => {
  const world = await seedAgentWorld();
  const indexed = await createOfficialResource(harness, world, { title: 'Indexed', text: LECTURE_TEXT });
  await createOfficialResource(harness, world, { title: 'Not yet indexed', text: LECTURE_TEXT });
  await indexFile({ fileId: indexed.file._id, infrastructure: harness.infrastructure });

  const a = await harness.login('a@example.test');
  const session = await startSubjectSession(a, world.offering._id);
  const response = await ask(a, session.id, 'normalization');
  assert.equal(response.status, 201);
  assert.equal(response.body.data.indexing.pendingDocuments, 1);
  assert.equal(harness.enqueued.filter((job) => job.name === 'study-agent.index-document').length, 1);

  const sources = await a.agent.get(`/api/study-agent/sessions/${session.id}/sources`);
  const byTitle = Object.fromEntries(sources.body.data.items.map((item) => [item.title, item.indexStatus]));
  assert.deepEqual(byTitle, { Indexed: 'INDEXED', 'Not yet indexed': 'PENDING' });
});

dbTest('indexing_is_idempotent_and_marks_unsupported_types', async () => {
  const world = await seedAgentWorld();
  const { file } = await createOfficialResource(harness, world, { title: 'Doc', text: LECTURE_TEXT });
  await indexFile({ fileId: file._id, infrastructure: harness.infrastructure });
  const first = await DocumentChunk.countDocuments({ fileId: file._id });
  const again = await indexFile({ fileId: file._id, infrastructure: harness.infrastructure });
  assert.equal(again.reused, true);
  assert.equal(await DocumentChunk.countDocuments({ fileId: file._id }), first);

  const slide = await createOfficialResource(harness, world, { title: 'Slides', text: 'x', });
  slide.file.mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  await slide.file.save();
  assert.equal((await indexFile({ fileId: slide.file._id, infrastructure: harness.infrastructure })).status, 'UNSUPPORTED');
  assert.equal((await DocumentIndex.findOne({ fileId: slide.file._id })).status, 'UNSUPPORTED');
});

dbTest('post_scan_hook_queues_indexing_only_for_safe_learning_files', async () => {
  const world = await seedAgentWorld();
  const safe = await createOfficialResource(harness, world, { title: 'Safe', text: LECTURE_TEXT });
  const bad = await createOfficialResource(harness, world, { title: 'Bad', text: LECTURE_TEXT, scanStatus: 'UNSAFE' });
  assert.equal(await enqueueIndexAfterScan({ queue: harness.infrastructure.queue, fileId: safe.file._id }), true);
  assert.equal(await enqueueIndexAfterScan({ queue: harness.infrastructure.queue, fileId: bad.file._id }), false);
  assert.equal(harness.enqueued.length, 1);
});

dbTest('provider_failure_returns_503_keeps_the_question_and_skips_it_in_later_history', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSubjectSession(a, world.offering._id);

  harness.provider.reply = () => {
    throw new AiProviderError('upstream exploded', { retryable: true });
  };
  const failed = await ask(a, session.id, 'First question');
  assert.equal(failed.status, 503);
  assert.equal(failed.body.error.code, 'AI_UNAVAILABLE');

  const rows = await StudyMessage.find({ sessionId: session.id });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].failed, true);

  harness.provider.reply = undefined;
  harness.provider.calls.length = 0;
  const retry = await ask(a, session.id, 'First question again');
  assert.equal(retry.status, 201);
  const sentRoles = harness.provider.calls[0].messages.map((message) => message.text);
  assert.equal(sentRoles.length, 1);
  assert.doesNotMatch(sentRoles[0], /^First question$/m);
});

dbTest('unconfigured_ai_returns_503_without_storing_anything', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSubjectSession(a, world.offering._id);
  harness.provider.configured = false;
  const response = await ask(a, session.id, 'Hello');
  assert.equal(response.status, 503);
  assert.equal(await StudyMessage.countDocuments({}), 0);
});

dbTest('message_validation_rejects_empty_oversized_and_non_string_content', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSubjectSession(a, world.offering._id);
  assert.equal((await ask(a, session.id, '   ')).status, 400);
  assert.equal((await ask(a, session.id, 'x'.repeat(harness.config.studyAgent.maxMessageChars + 1))).status, 400);
  const nonString = await a.agent
    .post(`/api/study-agent/sessions/${session.id}/messages`)
    .set('X-CSRF-Token', a.csrfToken)
    .send({ content: { $ne: null } });
  assert.equal(nonString.status, 400);
  assert.equal(harness.provider.calls.length, 0);
});

dbTest('per_minute_and_daily_limits_return_429', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSubjectSession(a, world.offering._id);

  harness.config.studyAgent.messagesPerMinute = 2;
  assert.equal((await ask(a, session.id, 'one')).status, 201);
  assert.equal((await ask(a, session.id, 'two')).status, 201);
  assert.equal((await ask(a, session.id, 'three')).status, 429);

  resetMinuteLimits();
  harness.config.studyAgent.messagesPerMinute = 1000;
  harness.config.studyAgent.dailyRequests = 2;
  assert.equal((await ask(a, session.id, 'four')).status, 429);
});

dbTest('sessions_list_resume_rename_and_archive', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const used = await startSubjectSession(a, world.offering._id);
  const empty = await a.agent
    .post('/api/study-agent/sessions')
    .set('X-CSRF-Token', a.csrfToken)
    .send({ mode: 'FREE' });
  await ask(a, used.id, 'Hello tutor');

  const all = await a.agent.get('/api/study-agent/sessions');
  assert.equal(all.body.data.items.length, 2);
  assert.equal(all.body.data.items[0].id, used.id);

  const resumable = await a.agent.get('/api/study-agent/sessions?resumable=true');
  assert.deepEqual(resumable.body.data.items.map((item) => item.id), [used.id]);

  const renamed = await a.agent
    .patch(`/api/study-agent/sessions/${used.id}`)
    .set('X-CSRF-Token', a.csrfToken)
    .send({ title: '  My DB revision  ' });
  assert.equal(renamed.body.data.title, 'My DB revision');
  assert.equal(
    (await a.agent.patch(`/api/study-agent/sessions/${used.id}`).set('X-CSRF-Token', a.csrfToken).send({ title: ' ' })).status,
    400,
  );

  assert.equal((await a.agent.delete(`/api/study-agent/sessions/${empty.body.data.id}`).set('X-CSRF-Token', a.csrfToken)).status, 200);
  assert.equal((await a.agent.get(`/api/study-agent/sessions/${empty.body.data.id}`)).status, 404);
  assert.equal((await ask(a, empty.body.data.id, 'still there?')).status, 404);
  assert.equal((await StudySession.findById(empty.body.data.id)).status, 'ARCHIVED');
});

dbTest('message_history_is_paged_oldest_first_with_a_cursor', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSubjectSession(a, world.offering._id);
  for (const text of ['m1', 'm2', 'm3']) {
    await ask(a, session.id, text);
  }
  const first = await a.agent.get(`/api/study-agent/sessions/${session.id}?limit=4`);
  assert.equal(first.body.data.messages.length, 4);
  assert.equal(first.body.data.hasMore, true);
  assert.equal(first.body.data.messages.at(-1).role, 'agent');
  const older = await a.agent.get(`/api/study-agent/sessions/${session.id}?limit=4&before=${first.body.data.messages[0].id}`);
  assert.equal(older.body.data.messages.length, 2);
  assert.equal(older.body.data.hasMore, false);
  assert.equal(older.body.data.messages[0].content.includes('m1'), true);
});

dbTest('revoked_access_to_an_offering_blocks_retrieval_on_the_next_message', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSubjectSession(a, world.offering._id);
  const { StudentAcademicContext } = await import('../../src/modules/academic-foundation/models/student-academic-context.model.js');
  const { Semester } = await import('../../src/modules/academic-foundation/models/semester.model.js');
  const next = await Semester.create({
    departmentId: world.department._id,
    academicYearId: world.year._id,
    sequence: 2,
    name: 'Semester 2',
  });
  await StudentAcademicContext.updateOne({ userId: world.studentA._id }, { currentSemesterId: next._id });
  const response = await ask(a, session.id, 'Can I still use the old subject?');
  assert.equal(response.status, 404);
  assert.equal(harness.provider.calls.length, 0);
});

const PNG_BYTES = Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG\r\n\x1a\n'), Buffer.alloc(64, 7)]);

async function startAutoSession(student) {
  const response = await student.agent
    .post('/api/study-agent/sessions')
    .set('X-CSRF-Token', student.csrfToken)
    .send({ mode: 'AUTO' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(response.body.data.mode, 'AUTO');
  return response.body.data;
}

/** Router calls ask for JSON; tutor calls return text. */
function routedReply(route, text = 'Tutor reply.') {
  return (input) =>
    input.responseSchema
      ? { text: JSON.stringify(route), json: route, citations: [], usage: {} }
      : { text, json: null, citations: [], usage: {} };
}

dbTest('auto_session_routes_a_subject_question_to_the_subject_and_uses_its_materials', async () => {
  const world = await seedAgentWorld();
  await createOfficialResource(harness, world, { title: 'Lecture 1', text: LECTURE_TEXT });
  const a = await harness.login('a@example.test');
  const session = await startAutoSession(a);
  harness.provider.reply = routedReply({ mode: 'SUBJECT', offeringId: String(world.offering._id) }, 'Normalization reduces redundancy.');

  const response = await ask(a, session.id, 'What is normalization?');
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(response.body.data.agentMessage.route.mode, 'SUBJECT');
  assert.equal(response.body.data.agentMessage.route.subjectCode, 'ICT101');
  const tutorCall = harness.provider.calls.find((call) => !call.responseSchema);
  assert.match(tutorCall.system, /ICT101/);
  assert.notEqual(tutorCall.webSearch, true);
});

dbTest('auto_session_routes_general_questions_to_open_study_with_web_search', async () => {
  await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startAutoSession(a);
  harness.provider.reply = routedReply({ mode: 'FREE' });

  const response = await ask(a, session.id, 'How do black holes form?');
  assert.equal(response.body.data.agentMessage.route.mode, 'FREE');
  assert.equal(harness.provider.calls.find((call) => !call.responseSchema).webSearch, true);
});

dbTest('auto_session_never_routes_to_a_subject_the_student_cannot_access', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startAutoSession(a);
  harness.provider.reply = routedReply({ mode: 'SUBJECT', offeringId: String(world.otherOffering._id) });

  const response = await ask(a, session.id, 'Teach me ICT909');
  assert.equal(response.status, 201);
  assert.equal(response.body.data.agentMessage.route.mode, 'FREE');
  assert.equal(response.body.data.agentMessage.route.subjectCode, '');
});

dbTest('auto_session_keeps_answering_when_routing_fails', async () => {
  await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startAutoSession(a);
  harness.provider.reply = (input) => {
    if (input.responseSchema) {
      throw new AiProviderError('router down');
    }
    return { text: 'Still here.', json: null, citations: [], usage: {} };
  };
  const response = await ask(a, session.id, 'Hello');
  assert.equal(response.status, 201);
  assert.equal(response.body.data.agentMessage.content, 'Still here.');
  assert.equal(response.body.data.agentMessage.route.mode, 'FREE');
});

dbTest('agent_can_show_an_attached_image_back_and_invalid_image_markers_are_dropped', async () => {
  await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startAutoSession(a);
  const uploaded = await a.agent
    .post(`/api/study-agent/sessions/${session.id}/attachments`)
    .set('X-CSRF-Token', a.csrfToken)
    .attach('files', PNG_BYTES, { filename: 'q.png', contentType: 'image/png' });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  const fileId = uploaded.body.data.items[0].id;
  const { StoredFile } = await import('../../src/modules/files/index.js');
  await StoredFile.updateOne({ _id: fileId }, { scanStatus: 'SAFE', availability: 'AVAILABLE' });

  harness.provider.reply = routedReply({ mode: 'FREE' }, 'Look here:\n[image:1]\nThen not here:\n[image:4]');
  const response = await a.agent
    .post(`/api/study-agent/sessions/${session.id}/messages`)
    .set('X-CSRF-Token', a.csrfToken)
    .send({ content: 'Explain this', attachmentIds: [fileId] });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const agent = response.body.data.agentMessage;
  assert.match(agent.content, /\[image:1\]/);
  assert.doesNotMatch(agent.content, /\[image:4\]/);
  assert.equal(agent.attachments.length, 1);
  assert.equal(agent.attachments[0].id, fileId);
});

dbTest('agent_prompt_carries_only_the_signed_in_students_record', async () => {
  const world = await seedAgentWorld();
  const a = await harness.login('a@example.test');
  const session = await startSubjectSession(a, world.offering._id);
  const response = await ask(a, session.id, 'What is my registration number and which subjects do I have?');
  assert.equal(response.status, 201);
  const { system } = harness.provider.calls.at(-1);
  assert.match(system, /<student_record>/);
  assert.match(system, /Name: a\b/);
  assert.match(system, /SEU\/IS\/22\/ICT\/001/);
  assert.match(system, /ICT101 Database Systems \(3 credits\)/);
  assert.match(system, /Never reveal or guess any other student/);
  // Another student's identity and another batch's subjects never reach the model.
  assert.doesNotMatch(system, /SEU\/IS\/22\/ICT\/002/);
  assert.doesNotMatch(system, /SEU\/IS\/22\/ICT\/009/);
  assert.doesNotMatch(system, /ICT909/);
  assert.doesNotMatch(system, /Name: b\b/);
});
