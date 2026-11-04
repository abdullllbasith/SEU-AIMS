/**
 * Public API for the staff-agent module: the read-only Lecturer Assistant and Admin Assistant.
 * Other modules must import from this file only.
 */
import { ROLES } from '../../shared/constants/roles.js';
import { createRoleRouter } from './routes/index.js';
import { lecturerAgent } from './lecturer/lecturer-agent.js';
import { adminAgent } from './admin/admin-agent.js';

export const MODULE_ID = 'staff-agent';
export const LECTURER_API_PREFIX = '/api/lecturer-agent';
export const ADMIN_API_PREFIX = '/api/admin-agent';

export function createStaffAgentModule() {
  return {
    id: MODULE_ID,
    apiPrefix: '/api',
    routes: [
      { prefix: LECTURER_API_PREFIX, router: createRoleRouter(lecturerAgent, ROLES.LECTURER) },
      { prefix: ADMIN_API_PREFIX, router: createRoleRouter(adminAgent, ROLES.DEPARTMENT_ADMINISTRATOR) },
    ],
  };
}

export { StaffAgentUsage } from './models/index.js';
export { lecturerAgent, adminAgent };
