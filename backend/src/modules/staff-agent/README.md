# staff-agent

Read-only Lecturer Assistant and Admin Assistant. See `docs/decisions/0007-staff-agents.md`.

| Endpoint | Role | Purpose |
|---|---|---|
| `GET /api/lecturer-agent/access` | LECTURER | Mode and tool list |
| `POST /api/lecturer-agent/messages` | LECTURER | `{ content, history? }` returns `{ reply, sources }` |
| `GET /api/admin-agent/access` | DEPARTMENT_ADMINISTRATOR | Mode and tool list |
| `POST /api/admin-agent/messages` | DEPARTMENT_ADMINISTRATOR | Same shape |

`history` is a list of `{ role: 'user' | 'agent', text }`. The client keeps it.

## Layout

- `core/agent.service.js`: the shared loop (limits, tool routing, tool execution, answer).
- `core/compact.js`: shrinks service results to fit a prompt.
- `core/usage.service.js`: per-minute and daily limits, token counts.
- `lecturer/lecturer-agent.js` and `admin/admin-agent.js`: tool registries and prompts.

## Adding a tool

Add `{ name, label, description, params, run(principal, args, deps) }` to the agent's registry. `run` must call an existing read service with the given principal and must not write. Export the service from its module's `index.js` first, because other modules may only import from there. Add it to the unit test for tool names if it needs new arguments.
