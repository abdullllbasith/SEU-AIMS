import { runWithRequestContext } from '../infrastructure/observability/request-context.js';

export async function dispatchJob(processors, job) {
  const handler = processors[job?.name];
  if (!handler) {
    throw new Error(`No processor registered for job ${job?.name}`);
  }
  const context = {
    requestId: job?.payload?.requestId || job?.jobId || null,
    correlationId: job?.payload?.correlationId || job?.jobId || null,
  };
  return runWithRequestContext(context, () => handler(job));
}

export async function processQueuedJobs(queue, processors, { limit = 50 } = {}) {
  if (!queue?.takePending) {
    return { processed: 0 };
  }
  const jobs = await queue.takePending(limit);
  let processed = 0;
  for (const job of jobs) {
    await dispatchJob(processors, job);
    processed += 1;
  }
  return { processed };
}
