import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import { runAgent } from '../core/agent.service.js';

function deps(req) {
  return {
    config: req.app.get('config'),
    infrastructure: req.app.get('infrastructure') || {},
  };
}

export function createStaffAgentController(agent) {
  return {
    access: asyncHandler(async (req, res) => {
      agent.requireAccess(req.principal);
      sendSuccess(res, {
        enabled: true,
        mode: 'READ_ONLY',
        tools: agent.tools.map((tool) => ({ name: tool.name, label: tool.label, description: tool.description })),
      });
    }),
    sendMessage: asyncHandler(async (req, res) => {
      sendSuccess(res, await runAgent(agent, req.principal, req.body || {}, deps(req)));
    }),
  };
}
