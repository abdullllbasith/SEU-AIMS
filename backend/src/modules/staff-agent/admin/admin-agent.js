import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';
import {
  getDashboard,
  listStudents,
  listLecturers,
  listOfferingHealth,
  listResultImports,
  getCaOverview,
  getNotificationHealth,
  getJobs,
  getAudit,
  getDataQuality,
  getSecuritySignals,
} from '../../admin-operations/index.js';

const ACCOUNT_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'];

function accountStatus(value) {
  const upper = String(value || '').toUpperCase();
  return ACCOUNT_STATUSES.includes(upper) ? upper : undefined;
}

/** Every admin service derives the department from the principal and ignores any department the client sends. */
const TOOLS = [
  {
    name: 'dashboard',
    label: 'Admin dashboard',
    description: 'Department overview: active students, lecturers, batches, offerings, unpublished resources, pending result imports, CA conditions and applications, failed notifications, denied audit events, queue state.',
    params: [],
    run: (principal, _args, { infrastructure }) => getDashboard(principal, { infrastructure }),
  },
  {
    name: 'ca_overview',
    label: 'CA recovery overview',
    description: 'CA recovery counts: incomplete CA by status, applications by workflow status, upcoming assessments, failed application PDFs.',
    params: [],
    run: (principal) => getCaOverview(principal),
  },
  {
    name: 'offering_health',
    label: 'Offering health',
    description: 'Subject offerings with their lecturer assignments, resources and upcoming events, to spot offerings with no lecturer or no resources. status may be ACTIVE or ARCHIVED.',
    params: ['status', 'page'],
    run: (principal, args) => listOfferingHealth(principal, { status: args.status?.toUpperCase(), page: args.page }),
  },
  {
    name: 'result_imports',
    label: 'Result imports',
    description: 'Recent result imports with processing status, who uploaded them, summaries and failure codes. status filters by processingStatus (for example FAILED, COMMITTED, UPLOADED).',
    params: ['status', 'page'],
    run: (principal, args) => listResultImports(principal, { processingStatus: args.status?.toUpperCase(), page: args.page }),
  },
  {
    name: 'jobs',
    label: 'Background jobs',
    description: 'Background job queue snapshot and recently failed jobs.',
    params: [],
    run: (principal, _args, { infrastructure }) => getJobs(principal, { infrastructure }),
  },
  {
    name: 'notification_health',
    label: 'Notification health',
    description: 'Notification delivery health: pending, failed and sent counts and provider state.',
    params: [],
    run: (principal, _args, { config }) => getNotificationHealth(principal, { config }),
  },
  {
    name: 'data_quality',
    label: 'Data quality checks',
    description: 'Integrity checks across academic data, such as orphaned records and inconsistencies.',
    params: [],
    run: (principal) => getDataQuality(principal),
  },
  {
    name: 'security_signals',
    label: 'Security signals',
    description: 'Denied-access counts and the most recent denied audit events.',
    params: [],
    run: (principal) => getSecuritySignals(principal),
  },
  {
    name: 'audit_events',
    label: 'Audit events',
    description: 'Recent audit log events for the department.',
    params: ['page'],
    run: (principal, args) => getAudit(principal, { page: args.page }),
  },
  {
    name: 'find_students',
    label: 'Student lookup',
    description: 'Find students by registration number fragment (q) and optionally by account status. Returns names, registration numbers and academic context.',
    params: ['q', 'status', 'page'],
    run: (principal, args) => listStudents(principal, { q: args.q, accountStatus: accountStatus(args.status), page: args.page }),
  },
  {
    name: 'find_lecturers',
    label: 'Lecturer lookup',
    description: 'Find lecturers by name fragment (q) and optionally by account status. Returns verification status and active assignment counts.',
    params: ['q', 'status', 'page'],
    run: (principal, args) => listLecturers(principal, { q: args.q, accountStatus: accountStatus(args.status), page: args.page }),
  },
];

export const adminAgent = Object.freeze({
  kind: 'ADMIN',
  label: 'department administrator',
  fallbackTool: 'dashboard',
  tools: TOOLS,
  requireAccess(principal) {
    if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
      throw new ForbiddenError('The admin assistant is for department administrators only');
    }
  },
  systemPrompt: [
    'You are the Admin Assistant inside SEU-AIMS, the department learning platform of a Sri Lankan university department.',
    'You help a department administrator monitor operations: people, offerings, result imports, CA recovery, background jobs, data quality and security signals.',
    'You only know what the DATA block shows, and it only covers the administrator\'s own department.',
    'When something looks wrong, say what you see in the data and which page of the system the administrator should use to act on it.',
  ].join('\n'),
});
