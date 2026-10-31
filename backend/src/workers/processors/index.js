import { JOB_NAMES } from '../../infrastructure/queue/job-names.js';
import { processMalwareScan } from '../../modules/files/index.js';
import { syncSharedResourceAfterScan } from '../../modules/study-room/index.js';
import { processResultParse } from '../../modules/results/index.js';
import { recalculateStudentGpa } from '../../modules/gpa-cgpa/index.js';
import { generateApplicationPdf, processEcaDetectJob } from '../../modules/ca-recovery/index.js';
import { processNotificationDeliver } from '../../modules/notifications/index.js';
import { evaluateCalendarReminder } from '../../modules/notices-calendar/index.js';
import { syncOfficialResourceAfterScan } from '../../modules/learning-environment/index.js';

/**
 * Processors delegate to module services. They do not invent academic rules.
 * Job payloads are identifiers; services reload authoritative documents.
 */
export function registerJobProcessors({ logger, infrastructure }) {
  const processors = {
    [JOB_NAMES.RESULT_PARSE]: async (job) => {
      await processResultParse({
        importId: job?.payload?.importId,
        infrastructure,
      });
    },
    [JOB_NAMES.ECA_DETECT]: async (job) => {
      await processEcaDetectJob({
        studentUserId: job?.payload?.studentUserId,
        importId: job?.payload?.importId,
      });
    },
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
      // CA reminders are stored as SCHEDULED notifications and released by the notification dispatcher
      // sweep when due. Jobs queued by older versions are intentionally ignored.
    },
    [JOB_NAMES.FILE_MALWARE_SCAN]: async (job) => {
      await processMalwareScan({
        fileId: job?.payload?.fileId,
        scanner: infrastructure?.malwareScanner,
        logger,
      });
      await syncSharedResourceAfterScan(job?.payload?.fileId);
      await syncOfficialResourceAfterScan(job?.payload?.fileId);
    },
  };

  const wrapped = {};
  for (const [name, handler] of Object.entries(processors)) {
    wrapped[name] = async (job) => {
      try {
        return await handler(job);
      } catch (error) {
        logger.error('Job failed', {
          name,
          jobId: job?.jobId,
          correlationId: job?.payload?.correlationId,
          message: error.message,
        });
        await infrastructure.queue?.markFailed?.(job, error);
        throw error;
      }
    };
  }
  return wrapped;
}
