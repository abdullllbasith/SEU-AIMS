# 0007: Lecturer and Admin assistants (read-only)

Status: accepted for Phase 1. Extends ADR 0006; does not change ADR 0002 or ADR 0004.

## Decision

Lecturers and department administrators each get a separate, read-only assistant in the `staff-agent` module:

- `/api/lecturer-agent` for the `LECTURER` role.
- `/api/admin-agent` for the `DEPARTMENT_ADMINISTRATOR` role.

The Study Agent stays student-only, and Study Room stays student-only (ADR 0004). No new roles are added (ADR 0002).

## Why two agents on one core

Their scopes differ (a lecturer's assigned offerings versus the whole department), and admin actions will be riskier later. The route chooses the tool set, so a lecturer's request can never reach an admin tool. The loop, limits and prompt rules are shared.

## How it works

1. The model picks at most three tools from a fixed registry (structured output). Unknown tools and malformed arguments are dropped.
2. The server runs each tool with the caller's own principal. Each tool wraps an existing read service, so that service's own scope applies: assigned offerings for lecturers, `departmentId` from the principal for admins. Ids the model produces are never trusted.
3. Results are shortened and sent to the model inside a DATA block that is described as untrusted text.
4. The answer cites tools as `[tool_name]`. The response lists every tool that ran and whether it was cited.

## Rules

- Phase 1 reads only. No tool creates, updates, publishes, approves, sends or deletes. A unit test checks tool names.
- Official result rows are not exposed to the lecturer assistant yet.
- Conversation history is kept by the client, validated on the server, and treated as data. Forged roles are dropped.
- Usage is limited per user, per agent, per minute and per day. Only counts and token totals are stored (`StaffAgentUsage`), never message text.
- Student names and registration numbers may be sent to the AI provider (decision recorded with the project owner).

## Later phases

Drafting (notices, reminders) and confirmed actions will add proposal cards that a person confirms, going through the owning module's existing services. That needs its own ADR and audit entries.
