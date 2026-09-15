import { currentCorrelationId } from '../observability/request-context.js';

/**
 * Job queue abstraction. Redis-backed durable transport remains a later attachment
 * when REDIS_URL is set; this in-memory adapter is used for local/dev/test drain.
 */
export class JobQueue {
  /**
   * @param {{ name: string, payload: object, jobId?: string }} job
   */
  async enqueue(_job) {
    throw new Error('JobQueue.enqueue must be implemented');
  }

  async close() {}
}

export class InMemoryJobQueue extends JobQueue {
  constructor({ logger } = {}) {
    super();
    this.logger = logger;
    this.jobs = [];
    this.pending = [];
    this.failed = [];
  }

  async enqueue(job) {
    const correlationId = job.payload?.correlationId || currentCorrelationId();
    const payload = correlationId ? { ...job.payload, correlationId } : job.payload;
    const record = { ...job, payload, enqueuedAt: new Date().toISOString() };
    this.jobs.push(record);
    this.pending.push(record);
    this.logger?.debug('Job enqueued in memory (development/test only)', {
      name: job.name,
      jobId: job.jobId,
      correlationId,
    });
    return { id: job.jobId ?? String(this.jobs.length) };
  }

  async takePending(limit = 50) {
    return this.pending.splice(0, Math.max(1, limit));
  }

  async markFailed(job, error) {
    this.failed.push({
      name: job?.name,
      jobId: job?.jobId,
      failedAt: new Date().toISOString(),
      category: error?.code || 'FAILED',
    });
  }
}

export function createJobQueue({ redisUrl, logger }) {
  if (!redisUrl) {
    logger?.warn('Job queue using in-memory adapter because REDIS_URL is not set');
  } else {
    logger?.info('REDIS_URL is set; durable queue transport will be attached in a later prompt');
  }

  return new InMemoryJobQueue({ logger });
}
