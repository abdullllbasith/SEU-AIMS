# QA inventory (Prompt 14)

Inspected 2026-09-15. Existing automated tests before this prompt lived under:

- `backend/tests/unit/` — domain rules, parsers, GPA engine, policies, redaction, orchestration envelope
- `backend/tests/integration/` — Mongo-backed module flows, workers drain, dashboard
- `backend/tests/security/` — default-deny, webhooks, observability
- `frontend/src/**/*.test.js(x)` — Vitest/jsdom (roles, ProtectedRoute, crypto, API helpers)

Gaps this prompt filled (not a rewrite of stable modules):

- shared synthetic identities `STUDENT_A/B/C`, `LECTURER_A/B`, `ADMIN_A/B`
- object-level authorization matrix tests
- mass-assignment / operator payload tests
- release smoke suite
- notification/CA concurrency tests
- CI workflow and split npm scripts
- documented UAT/traceability/risk (human UAT is **not** marked passed)

No Playwright/Cypress E2E browser driver was added: the repo had none, and Prompt 14 forbids inventing a huge unused E2E stack.

Prompt 18 added `backend/tests/unit/admin-operations.test.js`, `backend/tests/integration/admin-operations.test.js`, and `frontend/src/modules/admin/admin-api.test.js`.

Prompt 19 extends student-experience composition tests (attention, search scope) and documents [student-experience-map.md](./student-experience-map.md) and [student-experience-acceptance.md](./student-experience-acceptance.md).

Prompt 20 adds `backend/tests/unit/lecturer-workspace.test.js`, `backend/tests/integration/lecturer-workspace.test.js`, [lecturer-workspace-map.md](./lecturer-workspace-map.md), [lecturer-workspace-acceptance.md](./lecturer-workspace-acceptance.md), and [lecturer-workspace-idor.md](./lecturer-workspace-idor.md).
