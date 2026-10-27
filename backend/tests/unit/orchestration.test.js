import assert from 'node:assert/strict';
import test from 'node:test';
import { createDomainEvent } from '../../src/infrastructure/events/domain-event.js';
import { JOB_NAMES } from '../../src/infrastructure/queue/job-names.js';
import { InMemoryJobQueue } from '../../src/infrastructure/queue/job-queue.js';
import { registerJobProcessors } from '../../src/workers/processors/index.js';
import { processQueuedJobs } from '../../src/workers/dispatch.js';

test('domain event envelope has identity, producer, version, and entity reference', () => {
  const event = createDomainEvent({
    eventType: 'OFFICIAL_RESULT_UPDATED',
    producer: 'results',
    entityType: 'AcademicResult',
    entityId: 'abc',
    departmentId: 'dept1',
    actorId: 'admin1',
    payload: { subjectCode: 'ICT1233' },
  });
  assert.ok(event.eventId);
  assert.equal(event.eventType, 'OFFICIAL_RESULT_UPDATED');
  assert.equal(event.version, 1);
  assert.equal(event.producer, 'results');
  assert.equal(event.entityId, 'abc');
  assert.equal(event.payload.subjectCode, 'ICT1233');
});

test('job processors cover every reserved job name including ECA detect', () => {
  const processors = registerJobProcessors({
    logger: { error() {}, info() {} },
    infrastructure: {},
  });
  for (const name of Object.values(JOB_NAMES)) {
    assert.equal(typeof processors[name], 'function');
  }
});

test('in-memory queue drain is idempotent for an empty pending list', async () => {
  const queue = new InMemoryJobQueue();
  const processors = { 'results.parse': async () => {} };
  const first = await processQueuedJobs(queue, processors);
  const second = await processQueuedJobs(queue, processors);
  assert.equal(first.processed, 0);
  assert.equal(second.processed, 0);
});
