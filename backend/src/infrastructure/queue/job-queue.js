/**
 * Job queue abstraction. Redis-backed implementation is added when workers are wired.
 * In-memory fallback is for local structure tests only — not production architecture.
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
  }

  async enqueue(job) {
    this.jobs.push({ ...job, enqueuedAt: new Date().toISOString() });
    this.logger?.debug('Job enqueued in memory (development/test only)', {
      name: job.name,
      jobId: job.jobId,
    });
    return { id: job.jobId ?? String(this.jobs.length) };
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
