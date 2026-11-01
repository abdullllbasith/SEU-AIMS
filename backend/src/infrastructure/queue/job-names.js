/**
 * Job names are infrastructure identifiers. Business rules stay in domain services.
 */
export const JOB_NAMES = Object.freeze({
  RESULT_PARSE: 'results.parse',
  ECA_DETECT: 'results.eca-detect',
  GPA_RECALCULATE: 'gpa.recalculate',
  CA_PDF_GENERATE: 'ca-recovery.generate-pdf',
  NOTIFICATION_DELIVER: 'notifications.deliver',
  REMINDER_SCHEDULE: 'notifications.reminder',
  FILE_MALWARE_SCAN: 'files.malware-scan',
  STUDY_AGENT_INDEX_DOCUMENT: 'study-agent.index-document',
});
