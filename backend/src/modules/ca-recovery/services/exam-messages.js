import { formatColombo } from '../../../shared/time/colombo.js';

const BODY = {
  CA_EXAM_SCHEDULED:
    'Your CA examination for {{subjectCode}} {{subjectName}} is scheduled on {{examDate}} at {{examTime}} (Asia/Colombo). Venue: {{venue}}.',
  CA_EXAM_RESCHEDULED:
    'Your CA examination for {{subjectCode}} {{subjectName}} has been rescheduled to {{examDate}} at {{examTime}} (Asia/Colombo). Venue: {{venue}}.',
  CA_EXAM_CANCELLED:
    'The CA examination for {{subjectCode}} {{subjectName}} that was set for {{examDate}} at {{examTime}} (Asia/Colombo) has been cancelled. Reason: {{reason}}.',
  CA_REMINDER:
    'Reminder: your CA examination for {{subjectCode}} {{subjectName}} is in {{offsetDays}} day(s), on {{examDate}} at {{examTime}} (Asia/Colombo). Venue: {{venue}}.',
  CA_LECTURER_APPROVED_STUDENT:
    'An approved CA recovery application ({{registrationNumber}}, {{applicationId}}) is waiting for {{subjectCode}} {{subjectName}}. Publish the examination notice in the CA workspace.',
};

/**
 * Template variables, body template and ordered WhatsApp template parameters for a CA message.
 * WhatsApp template body variables must be defined in this order when the template is created in Meta:
 *   exam types and reminder: {{1}} subject code, {{2}} subject name, {{3}} date, {{4}} time, {{5}} venue,
 *     and for CA_REMINDER {{6}} days remaining;
 *   cancelled: {{1}} subject code, {{2}} subject name, {{3}} date, {{4}} time, {{5}} reason.
 */
export function buildCaMessage({ type, subject, notice, application, reason = '', offsetDays }) {
  const when = notice?.scheduledAt ? formatColombo(notice.scheduledAt) : { date: '', time: '' };
  const vars = {
    bodyTemplate: BODY[type],
    subjectCode: subject?.code || '',
    subjectName: subject?.name || '',
    examDate: when.date,
    examTime: when.time,
    venue: notice?.venue || '',
    reason: reason || 'Not stated',
    applicationId: application?.applicationId || '',
    registrationNumber: application?.registrationNumber || '',
    offsetDays: offsetDays === undefined ? '' : String(offsetDays),
  };
  let templateParams;
  if (type === 'CA_EXAM_CANCELLED') {
    templateParams = [vars.subjectCode, vars.subjectName, vars.examDate, vars.examTime, vars.reason];
  } else {
    templateParams = [vars.subjectCode, vars.subjectName, vars.examDate, vars.examTime, vars.venue];
    if (type === 'CA_REMINDER') {
      templateParams.push(vars.offsetDays);
    }
  }
  return { vars, templateParams };
}
