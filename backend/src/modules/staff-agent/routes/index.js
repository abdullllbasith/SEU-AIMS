import { Router } from 'express';
import { requireRole } from '../../../shared/auth/authorize.js';
import { requireCsrf } from '../../authentication/middleware/csrf.js';
import { createStaffAgentController } from '../controllers/staff-agent.controller.js';

/** One router per role. A lecturer can never reach an admin tool, because the tool set is chosen by the route. */
export function createRoleRouter(agent, role) {
  const router = Router();
  const controller = createStaffAgentController(agent);
  const guard = requireRole(role);

  router.get('/access', guard, controller.access);
  router.post('/messages', guard, requireCsrf, controller.sendMessage);

  return router;
}
