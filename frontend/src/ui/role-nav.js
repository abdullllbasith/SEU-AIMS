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
        { to: '/', label: 'Dashboard', end: true, icon: 'home' },
        { to: '/learning', label: 'Official resources', icon: 'resources' },
        { to: '/results/me', label: 'Results', icon: 'imports' },
        { to: '/ca', label: 'CA recovery', icon: 'applications' },
        { to: '/study-room', label: 'Study Room', icon: 'chat' },
        { to: '/notices', label: 'Notices', icon: 'notices' },
      ],
      more: [
        { to: '/search', label: 'Search', icon: 'search' },
        { to: '/academic/me', label: 'Academic context', icon: 'academic' },
        { to: '/academic/history', label: 'History', icon: 'history' },
        { to: '/performance', label: 'Performance', icon: 'gpa' },
        { to: '/calendar', label: 'Calendar', icon: 'calendar' },
        { to: '/profile', label: 'Profile', icon: 'profile' },
      ],
    };
  }
  if (role === ROLES.LECTURER) {
    return {
      searchTo: '/lecturer/search',
      searchLabel: 'Search assigned subjects and resources',
      primary: [
        { to: '/', label: 'Workspace', end: true, icon: 'home' },
        { to: '/lecturer/learning', label: 'Official resources', icon: 'resources' },
        { to: '/lecturer/ca', label: 'CA recovery', icon: 'applications' },
        { to: '/lecturer/assistant', label: 'Assistant', icon: 'chat' },
        { to: '/calendar', label: 'Calendar', icon: 'calendar' },
        { to: '/notices', label: 'Notices', icon: 'notices' },
      ],
      more: [
        { to: '/lecturer/search', label: 'Search', icon: 'search' },
        { to: '/lecturer/offerings', label: 'Assigned offerings', icon: 'offerings' },
        { to: '/profile', label: 'Profile', icon: 'profile' },
      ],
    };
  }
  if (role === ROLES.DEPARTMENT_ADMINISTRATOR) {
    return {
      searchTo: '/admin/people',
      searchLabel: 'Find students and lecturers',
      primary: [
        { to: '/admin', label: 'Operations', end: true, icon: 'home' },
        { to: '/admin/academic', label: 'Academic admin', icon: 'academic' },
        { to: '/admin/results', label: 'Result imports', icon: 'imports' },
        { to: '/admin/ca', label: 'CA recovery', icon: 'applications' },
        { to: '/admin/people', label: 'People', icon: 'people' },
        { to: '/admin/assistant', label: 'Assistant', icon: 'chat' },
      ],
      more: [
        { to: '/admin/resources', label: 'Resources', icon: 'resources' },
        { to: '/notices', label: 'Notices', icon: 'notices' },
        { to: '/calendar', label: 'Calendar', icon: 'calendar' },
        { to: '/admin/study-room', label: 'Study Room moderation', icon: 'chat' },
        { to: '/admin/administrators', label: 'Administrators', icon: 'profile' },
        { to: '/admin/ops', label: 'Ops', icon: 'ops' },
        { to: '/profile', label: 'Profile', icon: 'profile' },
      ],
    };
  }
  return { primary: [], more: [], searchTo: '', searchLabel: '' };
}
