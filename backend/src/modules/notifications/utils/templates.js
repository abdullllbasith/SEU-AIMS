import { TEMPLATE_ALLOWED_VARS } from '../constants.js';

export function renderTemplate(template, vars = {}) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    if (!TEMPLATE_ALLOWED_VARS.includes(key)) {
      return '';
    }
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export const BUILTIN_TITLES = Object.freeze({
  CA_APPLICATION_SUBMITTED: 'CA application submitted',
  CA_APPLICATION_APPROVED: 'CA application approved',
  CA_APPLICATION_REJECTED: 'CA application decision',
  CA_APPLICATION_REOPENED: 'CA application reopened',
  CA_WINDOW_OPEN: 'CA application window is open',
  CA_SCHEDULED: 'CA assessment scheduled',
  CA_REMINDER: 'Upcoming CA assessment',
  CA_EXAM_SCHEDULED: 'CA examination scheduled: {{subjectCode}}',
  CA_EXAM_RESCHEDULED: 'CA examination rescheduled: {{subjectCode}}',
  CA_EXAM_CANCELLED: 'CA examination cancelled: {{subjectCode}}',
  CA_EXAM_COMPLETED: 'CA examination completed: {{subjectCode}}',
  CA_EXAM_MISSED: 'CA examination missed: {{subjectCode}}',
  CA_LECTURER_APPROVED_STUDENT: 'Approved CA student: {{subjectCode}}',
  RESULTS_UPDATED: 'Official results updated',
  NOTICE_PUBLISHED: '{{title}}',
  CALENDAR_REMINDER: 'Upcoming: {{eventTitle}}',
  STUDY_ROOM_NEW_MESSAGE: 'New Study Room message',
  ACADEMIC_EVENT_PUBLISHED: 'Calendar event published',
});
