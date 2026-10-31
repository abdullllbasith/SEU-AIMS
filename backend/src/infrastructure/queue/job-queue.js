import { randomUUID } from 'node:crypto';
import { currentCorrelationId } from '../observability/request-context.js';
import { JOB_NAMES } from './job-names.js';

const HIGH_PRIORITY = new Set([
  JOB_NAMES.FILE_MALWARE_SCAN,
  JOB_NAMES.RESULT_PARSE,
  JOB_NAMES.ECA_DETECT,
  JOB_NAMES.GPA_RECALCULATE,
  JOB_NAMES.CA_PDF_GENERATE,
]);

const LOW_PRIORITY = new Set([JOB_NAMES.REMINDER_SCHEDULE]);

export function jobPriority(name) {
  if (HIGH_PRIORITY.has(name)) {
    return 'high';
  }
  if (LOW_PRIORITY.has(name)) {
    return 'low';
  }
  return 'normal';
}

/**
 * Job queue abstraction. Durable transport is Redis lists when a Redis client is provided.
 */
export class JobQueue {
  /**
   * @param {{ name: string, payload: object, jobId?: string }} job
   */
  async enqueue(_job) {
    throw new Error('JobQueue.enqueue must be implemented');
  }

  async close() {}

  async depth() {
    return { high: 0, normal: 0, low: 0, failed: 0 };
  }

  async listFailed() {
    return [];
  }

  async retryFailed() {
    return null;
  }
}

function failedRecord(job, error) {
  return {
    name: job?.name,
    jobId: job?.jobId || randomUUID(),
    payload: job?.payload || null,
    priority: job?.priority,
    failedAt: new Date().toISOString(),
    category: error?.code || 'FAILED',
  };
}

export function summarizeFailedJob(row) {
  return {
    name: row?.name || '',
    jobId: row?.jobId || '',
    failedAt: row?.failedAt || null,
    category: row?.category || 'FAILED',
    retryable: Boolean(row?.name && row?.jobId && row?.payload),
  };
}

export class InMemoryJobQueue extends JobQueue {
  constructor({ logger } = {}) {
    super();
    this.logger = logger;
    this.jobs = [];
    this.pending = [];
    this.failed = [];
    this.adapter = 'memory';
  }

  async enqueue(job) {
    const correlationId = job.payload?.correlationId || currentCorrelationId();
    const payload = correlationId ? { ...job.payload, correlationId } : job.payload;
    const record = {
      ...job,
      payload,
      priority: jobPriority(job.name),
      enqueuedAt: new Date().toISOString(),
    };
    this.jobs.push(record);
    this.pending.push(record);
    this.logger?.debug('Job enqueued in memory', {
      name: job.name,
      jobId: job.jobId,
      correlationId,
      priority: record.priority,
    });
    return { id: job.jobId ?? String(this.jobs.length) };
  }

  async takePending(limit = 50) {
    const ordered = [
      ...this.pending.filter((job) => job.priority === 'high'),
      ...this.pending.filter((job) => job.priority === 'normal' || !job.priority),
      ...this.pending.filter((job) => job.priority === 'low'),
    ];
    const taken = ordered.slice(0, Math.max(1, limit));
    const takenSet = new Set(taken);
    this.pending = this.pending.filter((job) => !takenSet.has(job));
    return taken;
  }

  async markFailed(job, error) {
    this.failed.push(failedRecord(job, error));
    if (this.failed.length > 1000) {
      this.failed.splice(0, this.failed.length - 1000);
    }
  }

  async listFailed(limit = 20) {
    return this.failed.slice(-Math.max(1, limit)).reverse().map(summarizeFailedJob);
  }

  async retryFailed(jobId) {
    const index = this.failed.findIndex((row) => row.jobId === jobId);
    if (index < 0) {
      return null;
    }
    const [row] = this.failed.splice(index, 1);
    if (!row?.name || !row.payload || !row.jobId) {
      this.failed.splice(index, 0, row);
      return null;
    }
    await this.enqueue({ name: row.name, payload: row.payload, jobId: row.jobId });
    return { jobId: row.jobId, name: row.name };
  }

  async depth() {
    return {
      high: this.pending.filter((job) => job.priority === 'high').length,
      normal: this.pending.filter((job) => job.priority !== 'high' && job.priority !== 'low').length,
      low: this.pending.filter((job) => job.priority === 'low').length,
      failed: this.failed.length,
    };
  }
}

export class RedisJobQueue extends JobQueue {
  constructor({ redis, logger, prefix = 'seu-aims:queue' } = {}) {
    super();
    this.redis = redis;
    this.logger = logger;
    this.prefix = prefix;
    this.adapter = 'redis';
    this.keys = {
      high: `${prefix}:high`,
      normal: `${prefix}:normal`,
      low: `${prefix}:low`,
      failed: `${prefix}:failed`,
    };
  }

  async enqueue(job) {
    const correlationId = job.payload?.correlationId || currentCorrelationId();
    const payload = correlationId ? { ...job.payload, correlationId } : job.payload;
    const record = {
      ...job,
      payload,
      priority: jobPriority(job.name),
      enqueuedAt: new Date().toISOString(),
    };
    await this.redis.rpush(this.keys[record.priority], JSON.stringify(record));
    this.logger?.debug('Job enqueued on Redis', {
      name: job.name,
      jobId: job.jobId,
      priority: record.priority,
    });
    return { id: job.jobId ?? record.enqueuedAt };
  }

  async takePending(limit = 50) {
    const taken = [];
    for (const key of [this.keys.high, this.keys.normal, this.keys.low]) {
      while (taken.length < Math.max(1, limit)) {
        const raw = await this.redis.lpop(key);
        if (!raw) {
          break;
        }
        taken.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
      }
    }
    return taken;
  }

  async markFailed(job, error) {
    await this.redis.lpush(this.keys.failed, JSON.stringify(failedRecord(job, error)));
    await this.redis.ltrim(this.keys.failed, 0, 999);
  }

  async listFailed(limit = 20) {
    const raw = await this.redis.lrange(this.keys.failed, 0, Math.max(1, limit) - 1);
    return raw.map((entry) => summarizeFailedJob(typeof entry === 'string' ? JSON.parse(entry) : entry));
  }

  async retryFailed(jobId) {
    const raw = await this.redis.lrange(this.keys.failed, 0, 999);
    const rows = raw.map((entry) => (typeof entry === 'string' ? JSON.parse(entry) : entry));
    const index = rows.findIndex((row) => row.jobId === jobId);
    if (index < 0) {
      return null;
    }
    const row = rows[index];
    if (!row?.name || !row.payload || !row.jobId) {
      return null;
    }
    const kept = rows.filter((item) => item.jobId !== jobId);
    await this.redis.del(this.keys.failed);
    for (const item of kept) {
      await this.redis.rpush(this.keys.failed, JSON.stringify(item));
    }
    await this.enqueue({ name: row.name, payload: row.payload, jobId: row.jobId });
    return { jobId: row.jobId, name: row.name };
  }

  async depth() {
    const [high, normal, low, failed] = await Promise.all([
      this.redis.llen(this.keys.high),
      this.redis.llen(this.keys.normal),
      this.redis.llen(this.keys.low),
      this.redis.llen(this.keys.failed),
    ]);
    return {
      high: Number(high) || 0,
      normal: Number(normal) || 0,
      low: Number(low) || 0,
      failed: Number(failed) || 0,
    };
  }

  async close() {}
}

export function createJobQueue({ redis, redisUrl, logger, prefix } = {}) {
  if (redis) {
    logger?.info('Job queue using Redis list transport');
    return new RedisJobQueue({ redis, logger, prefix });
  }
  if (redisUrl) {
    logger?.warn('REDIS_URL is set but Redis is not connected; using in-memory queue');
  } else {
    logger?.warn('Job queue using in-memory adapter because Redis is not connected');
  }
  return new InMemoryJobQueue({ logger });
}
