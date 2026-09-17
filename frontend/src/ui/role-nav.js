import { ROLES } from '../constants/roles.js';

export function roleLabel(role) {
  if (role === ROLES.STUDENT) {
    return 'Student';
  }
  if (role === ROLES.LECTURER) {
    return 'Lecturer';
  }
  if (role === ROLES.DEPARTMENT_ADMINISTRATOR) {
    return 'Department Administrator';
  }
  return role;
}

export function navForRole(role) {
  if (role === ROLES.STUDENT) {
    return {
      searchTo: '/search',
      searchLabel: 'Search official subjects and resources',
      primary: [
        { to: '/', label: 'Dashboard', end: true },
        { to: '/learning', label: 'Official resources' },
        { to: '/results/me', label: 'Results' },
        { to: '/ca', label: 'CA recovery' },
        { to: '/study-room', label: 'Study Room' },
        { to: '/notices', label: 'Notices' },
      ],
      more: [
        { to: '/search', label: 'Search' },
        { to: '/academic/me', label: 'Academic context' },
        { to: '/academic/history', label: 'History' },
        { to: '/performance', label: 'Performance' },
        { to: '/calendar', label: 'Calendar' },
        { to: '/profile', label: 'Profile' },
      ],
    };
  }
  if (role === ROLES.LECTURER) {
    return {
      searchTo: '/lecturer/search',
      searchLabel: 'Search assigned subjects and resources',
      primary: [
        { to: '/', label: 'Workspace', end: true },
        { to: '/lecturer/learning', label: 'Official resources' },
        { to: '/lecturer/ca', label: 'CA recovery' },
        { to: '/calendar', label: 'Calendar' },
        { to: '/notices', label: 'Notices' },
      ],
      more: [
        { to: '/lecturer/search', label: 'Search' },
        { to: '/lecturer/offerings', label: 'Assigned offerings' },
        { to: '/profile', label: 'Profile' },
      ],
    };
  }
  if (role === ROLES.DEPARTMENT_ADMINISTRATOR) {
    return {
      searchTo: '/admin/people',
      searchLabel: 'Find students and lecturers',
      primary: [
        { to: '/admin', label: 'Operations', end: true },
        { to: '/admin/academic', label: 'Academic admin' },
        { to: '/admin/results', label: 'Result imports' },
        { to: '/admin/ca', label: 'CA recovery' },
        { to: '/admin/people', label: 'People' },
      ],
      more: [
        { to: '/admin/resources', label: 'Resources' },
        { to: '/notices', label: 'Notices' },
        { to: '/calendar', label: 'Calendar' },
        { to: '/admin/study-room', label: 'Study Room moderation' },
        { to: '/admin/ops', label: 'Ops' },
        { to: '/profile', label: 'Profile' },
      ],
    };
  }
  return { primary: [], more: [], searchTo: '', searchLabel: '' };
}
