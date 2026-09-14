import { JOB_NAMES } from '../../infrastructure/queue/job-names.js';

function unimplemented(name, logger) {
  return async (job) => {
    logger.info('Job processor reserved; domain implementation is later', {
      name,
      jobId: job?.jobId,
    });
  };
}

/**
 * Processors delegate to module services in later prompts.
 * Idempotency is a later requirement; structure is established here.
 */
export function registerJobProcessors({ logger }) {
  return {
    [JOB_NAMES.RESULT_PARSE]: unimplemented(JOB_NAMES.RESULT_PARSE, logger),
    [JOB_NAMES.ECA_DETECT]: unimplemented(JOB_NAMES.ECA_DETECT, logger),
    [JOB_NAMES.GPA_RECALCULATE]: unimplemented(JOB_NAMES.GPA_RECALCULATE, logger),
    [JOB_NAMES.CA_PDF_GENERATE]: unimplemented(JOB_NAMES.CA_PDF_GENERATE, logger),
    [JOB_NAMES.NOTIFICATION_DELIVER]: unimplemented(JOB_NAMES.NOTIFICATION_DELIVER, logger),
    [JOB_NAMES.REMINDER_SCHEDULE]: unimplemented(JOB_NAMES.REMINDER_SCHEDULE, logger),
    [JOB_NAMES.FILE_MALWARE_SCAN]: unimplemented(JOB_NAMES.FILE_MALWARE_SCAN, logger),
  };
}
