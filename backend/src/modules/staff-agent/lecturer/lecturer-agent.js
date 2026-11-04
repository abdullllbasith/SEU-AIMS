import { ForbiddenError, ValidationError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';
import {
  getLecturerDashboard,
  getAssignedOfferings,
  getOfferingRoster,
  getUpcoming,
  getCaEligible,
  getCaSchedules,
  searchLecturerWorkspace,
} from '../../lecturer-workspace/index.js';

/**
 * Resolves the offering a question is about. An exact id still goes through the lecturer's own
 * assignments (getOfferingRoster checks them), and a subject code or name only ever matches
 * offerings the lecturer is assigned to.
 */
async function resolveOffering(principal, { offeringId, q }) {
  if (offeringId) {
    return { offeringId };
  }
  const { items } = await getAssignedOfferings(principal);
  const term = String(q || '').trim().toLowerCase();
  if (!term) {
    if (items.length === 1) {
      return { offeringId: items[0].id };
    }
    return { choices: items.map(describeOffering) };
  }
  const matches = items.filter(
    (item) => (item.subjectCode || '').toLowerCase().includes(term) || (item.subjectName || '').toLowerCase().includes(term),
  );
  if (matches.length === 1) {
    return { offeringId: matches[0].id };
  }
  return { choices: (matches.length ? matches : items).map(describeOffering), matched: matches.length };
}

function describeOffering(item) {
  return {
    offeringId: item.id,
    subject: `${item.subjectCode || ''} ${item.subjectName || ''}`.trim(),
    batch: item.batchName || item.batchCode,
    academicYear: item.academicYearName,
    semester: item.semesterName,
    activeAssignment: item.isActiveAssignment,
  };
}

const TOOLS = [
  {
    name: 'my_dashboard',
    label: 'Lecturer dashboard',
    description: 'Overview of my teaching: counts, things needing attention, upcoming deadlines and events, notices, CA recovery summary. Use for "my day", "what needs attention", "what is coming up".',
    params: [],
    run: async (principal) => {
      const dashboard = await getLecturerDashboard(principal);
      return {
        generatedAt: dashboard.generatedAt,
        lecturerStatus: dashboard.lecturerStatus,
        summary: dashboard.summary,
        attention: dashboard.attention,
        deadlineGroups: dashboard.deadlineGroups,
        upcomingEvents: dashboard.upcomingEvents,
        notices: dashboard.notices,
        unreadNotifications: dashboard.notifications?.unreadCount,
        caRecovery: dashboard.caRecovery,
      };
    },
  },
  {
    name: 'my_offerings',
    label: 'My assigned offerings',
    description: 'The subject offerings I am assigned to (subject, batch, year, semester, resource counts, whether I can manage it).',
    params: [],
    run: (principal) => getAssignedOfferings(principal),
  },
  {
    name: 'offering_roster',
    label: 'Offering roster',
    description: 'Students (name and registration number) in one of my offerings. Use it for any question about who is in a subject, class list, students or "my students". Give q as a subject code or name, e.g. "ICT2113", taken from the question or the recent turns. If no subject is named, still choose this tool with no arguments: it picks the only offering, or lists the choices.',
    params: ['q', 'offeringId'],
    run: async (principal, args) => {
      const target = await resolveOffering(principal, args);
      if (!target.offeringId) {
        return {
          note: 'Could not tell which offering is meant. Ask the lecturer to pick one of these.',
          ...target,
        };
      }
      const roster = await getOfferingRoster(principal, target.offeringId);
      return { offeringId: target.offeringId, total: roster.items.length, students: roster.items };
    },
  },
  {
    name: 'upcoming',
    label: 'Upcoming events and deadlines',
    description: 'Upcoming calendar events and assignment deadlines for my offerings.',
    params: [],
    run: (principal) => getUpcoming(principal),
  },
  {
    name: 'ca_eligible_students',
    label: 'CA recovery: eligible students',
    description: 'Students approved for CA recovery in my offerings, with exam status and attendance.',
    params: [],
    run: (principal) => getCaEligible(principal),
  },
  {
    name: 'ca_schedules',
    label: 'CA recovery: schedules',
    description: 'CA recovery assessments I have scheduled.',
    params: [],
    run: (principal) => getCaSchedules(principal),
  },
  {
    name: 'search',
    label: 'Workspace search',
    description: 'Search my offerings, resources, events and CA registration numbers by a short prefix (subject code, title or registration number). Plain text only, up to 64 characters.',
    params: ['q'],
    run: (principal, args) => {
      if (!args.q) {
        throw new ValidationError('A search term is required');
      }
      return searchLecturerWorkspace(principal, { q: args.q });
    },
  },
];

export const lecturerAgent = Object.freeze({
  kind: 'LECTURER',
  label: 'lecturer',
  fallbackTool: 'my_dashboard',
  tools: TOOLS,
  requireAccess(principal) {
    if (!principal || principal.role !== ROLES.LECTURER) {
      throw new ForbiddenError('The lecturer assistant is for lecturers only');
    }
  },
  systemPrompt: [
    'You are the Lecturer Assistant inside SEU-AIMS, the department learning platform of a Sri Lankan university department.',
    'You help one lecturer understand their own teaching workload: assigned offerings, student rosters, deadlines, CA recovery and attention items.',
    'You only know what the DATA block shows, and it only ever contains this lecturer\'s own assignments.',
    'Official results are identified by registration number plus subject code. Do not state exam results or grades; this assistant has no access to them yet.',
  ].join('\n'),
});
