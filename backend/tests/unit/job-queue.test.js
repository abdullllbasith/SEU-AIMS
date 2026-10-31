import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryJobQueue,
  RedisJobQueue,
  createJobQueue,
  jobPriority,
} from '../../src/infrastructure/queue/job-queue.js';
import { JOB_NAMES } from '../../src/infrastructure/queue/job-names.js';
import { processQueuedJobs } from '../../src/workers/dispatch.js';

class MemoryRedis {
  constructor() {
    this.lists = new Map();
  }

  list(key) {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    return this.lists.get(key);
  }

  async rpush(key, value) {
    this.list(key).push(value);
    return this.list(key).length;
  }

  async lpop(key) {
    return this.list(key).shift() || null;
  }

  async lpush(key, value) {
    this.list(key).unshift(value);
    return this.list(key).length;
  }

  async ltrim(key, start, stop) {
    const next = this.list(key).slice(start, stop + 1);
    this.lists.set(key, next);
    return 'OK';
  }

  async llen(key) {
    return this.list(key).length;
  }

  async lrange(key, start, stop) {
    const list = this.list(key);
    const end = stop < 0 ? list.length : stop + 1;
    return list.slice(start, end);
  }

  async del(key) {
    this.lists.delete(key);
    return 1;
  }
}

test('malware scan jobs take priority over reminders', () => {
  assert.equal(jobPriority(JOB_NAMES.FILE_MALWARE_SCAN), 'high');
  assert.equal(jobPriority(JOB_NAMES.NOTIFICATION_DELIVER), 'normal');
  assert.equal(jobPriority(JOB_NAMES.REMINDER_SCHEDULE), 'low');
});

test('in-memory queue drains high-priority jobs first', async () => {
  const queue = new InMemoryJobQueue();
  await queue.enqueue({ name: JOB_NAMES.REMINDER_SCHEDULE, payload: { n: 1 } });
  await queue.enqueue({ name: JOB_NAMES.FILE_MALWARE_SCAN, payload: { n: 2 } });
  const [first] = await queue.takePending(1);
  assert.equal(first.name, JOB_NAMES.FILE_MALWARE_SCAN);
});

test('redis queue round-trips jobs and retains a bounded failed list', async () => {
  const redis = new MemoryRedis();
  const queue = new RedisJobQueue({ redis, prefix: 'test:queue' });
  await queue.enqueue({ name: JOB_NAMES.GPA_RECALCULATE, payload: { id: 'a' }, jobId: 'j1' });
  const pending = await queue.takePending(5);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].jobId, 'j1');
  await queue.markFailed(pending[0], { code: 'FAILED' });
  const depth = await queue.depth();
  assert.equal(depth.failed, 1);
  assert.equal(depth.high, 0);
  const failed = await queue.listFailed(5);
  assert.equal(failed[0].retryable, true);
  const retried = await queue.retryFailed(failed[0].jobId);
  assert.equal(retried.jobId, 'j1');
  const again = await queue.takePending(5);
  assert.equal(again[0].payload.id, 'a');
  assert.equal((await queue.depth()).failed, 0);
});

test('createJobQueue uses memory without redis and redis when a client is provided', () => {
  const memory = createJobQueue({ logger: { warn() {}, info() {} } });
  assert.equal(memory.adapter, 'memory');
  const redis = createJobQueue({ redis: new MemoryRedis(), logger: { warn() {}, info() {} } });
  assert.equal(redis.adapter, 'redis');
});

test('failed jobs are recorded without aborting the rest of the drain', async () => {
  const queue = new InMemoryJobQueue();
  await queue.enqueue({ name: 'ok.job', payload: {} });
  await queue.enqueue({ name: 'bad.job', payload: {} });
  const result = await processQueuedJobs(
    queue,
    {
      'ok.job': async () => {},
      'bad.job': async () => {
        throw new Error('boom');
      },
    },
    { limit: 10 },
  );
  assert.equal(result.processed, 1);
  assert.equal(result.failed, 1);
  assert.equal(queue.failed.length, 1);
});
