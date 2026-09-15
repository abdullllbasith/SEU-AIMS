import { JOB_NAMES } from '../../infrastructure/queue/job-names.js';
import { processMalwareScan } from '../modules/files/index.js';
import { syncSharedResourceAfterScan } from '../modules/study-room/index.js';
import { processResultParse } from '../modules/results/index.js';
import { recalculateStudentGpa } from '../modules/gpa-cgpa/index.js';
import { generateApplicationPdf, evaluateReminder } from '../modules/ca-recovery/index.js';
import { processNotificationDeliver } from '../modules/notifications/index.js';
import { evaluateCalendarReminder } from '../modules/notices-calendar/index.js';

function unimplemented(name, logger) {
  return async (job) => {
    logger.info('Job processor reserved; domain implementation is later', {
      name,
      jobId: job?.jobId,
    });
  };
}

/**
 * Processors delegate to module services. They do not invent academic rules.
 */
export function registerJobProcessors({ logger, infrastructure }) {
  return {
    [JOB_NAMES.RESULT_PARSE]: async (job) => {
      await processResultParse({
        importId: job?.payload?.importId,
        infrastructure,
      });
    },
    [JOB_NAMES.ECA_DETECT]: unimplemented(JOB_NAMES.ECA_DETECT, logger),
    [JOB_NAMES.GPA_RECALCULATE]: async (job) => {
      if (job?.payload?.studentUserId) {
        await recalculateStudentGpa(job.payload.studentUserId);
      }
    },
    [JOB_NAMES.CA_PDF_GENERATE]: async (job) => {
      await generateApplicationPdf({
        applicationId: job?.payload?.applicationId,
        config: infrastructure?.config,
        infrastructure,
      });
    },
    [JOB_NAMES.NOTIFICATION_DELIVER]: async (job) => {
      await processNotificationDeliver({
        notificationId: job?.payload?.notificationId,
        infrastructure,
        logger,
      });
    },
    [JOB_NAMES.REMINDER_SCHEDULE]: async (job) => {
      if (job?.payload?.calendarEventId) {
        await evaluateCalendarReminder({
          calendarEventId: job.payload.calendarEventId,
          offsetHours: job.payload.offsetHours,
          generation: job.payload.generation,
          infrastructure,
        });
        return;
      }
      await evaluateReminder({
        scheduleId: job?.payload?.scheduleId,
        offsetDays: job?.payload?.offsetDays,
        infrastructure,
      });
    },
    [JOB_NAMES.FILE_MALWARE_SCAN]: async (job) => {
      await processMalwareScan({
        fileId: job?.payload?.fileId,
        scanner: infrastructure?.malwareScanner,
        logger,
      });
      await syncSharedResourceAfterScan(job?.payload?.fileId);
    },
  };
}
