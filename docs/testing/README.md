# Testing

## Automated

| Command | What |
|---|---|
| `npm run test:unit` | Domain rules, parsers, GPA engine, queues (fake Redis) |
| `npm run test:integration` | Mongo memory **replica set** (transactions), HTTP, sockets |
| `npm run test:security` | Default-deny, IDOR, webhooks, mass assignment |
| `npm run test:frontend` | Vitest/jsdom |
| `npm run test:smoke` | Health + role smokes |
| `npm test` | Backend then frontend |

Synthetic identities: `STUDENT_A/B/C`, `LECTURER_A/B`, `ADMIN_A/B` in `backend/tests/helpers/qa-fixtures.js`. Fictional registrations only. Do not copy those passwords into production or this handbook.

Coverage percentage is optional (`backend` `test:coverage`) and is **not** a quality claim.

Inventory and gates: [qa/inventory.md](../qa/inventory.md), [qa/quality-gates.md](../qa/quality-gates.md), [qa/traceability.md](../qa/traceability.md).

## UAT / demo

Human scripts: [qa/uat-scenarios.md](../qa/uat-scenarios.md). **Not passed** from developer walkthroughs.

Demo narrative: [qa/demonstration-scenario.md](../qa/demonstration-scenario.md). Prefer noop providers.

CI: `.github/workflows/qa.yml` (`npm ci`, secrets scan, tests, build, bundle check, `audit:prod`).

Admin dashboard coverage is API integration tests in `backend/tests/integration/admin-operations.test.js`, not a browser driver.

Lecturer workspace coverage is API integration tests in `backend/tests/integration/lecturer-workspace.test.js`, not a browser driver.
