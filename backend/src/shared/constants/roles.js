/**
 * Application roles. Do not add HOD, SUPER_ADMIN, or other roles without approval.
 */
export const ROLES = Object.freeze({
  STUDENT: 'STUDENT',
  LECTURER: 'LECTURER',
  DEPARTMENT_ADMINISTRATOR: 'DEPARTMENT_ADMINISTRATOR',
});

export const ROLE_VALUES = Object.freeze(Object.values(ROLES));

export function isApprovedRole(role) {
  return ROLE_VALUES.includes(role);
}
