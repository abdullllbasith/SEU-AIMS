# Changelog (repository)

This is an implementation log, not marketing. Dates are engineering session dates.

## 0.1.0 — Prompts 00–17

- **02–03** Workspace, modular layout, infrastructure adapters.
- **04** Authentication, three roles, CSRF, sessions.
- **05** Academic foundation (department → offering, registration number on context).
- **06** Official resources on subject offerings.
- **07** Student-only Study Room, E2E ciphertext fields.
- **08** Result import; official rows; repeat updates same identity.
- **09** CA Recovery (physical verify, no HOD portal, no grade write on complete).
- **10** Notices, calendar representation, notifications.
- **11** Profile and dashboard composition.
- **12** Audit, health, webhooks, production config gate.
- **13** Jobs/events contracts; orchestration tests.
- **14** QA fixtures, CI, IDOR/smoke, release docs. Recommendation: ready with known limitations.
- **15** Redis job lists, Socket.IO Redis adapter wiring, compose/nginx samples, ops docs.
- **16** Developer handbook, ADRs, diagrams, env reference, doc link check.
- **17** Final audit: automated 189 tests + production frontend build on 2026-09-15. Decision: ready with known limitations. See `docs/qa/final-audit.md`.
- **18** Department admin operational dashboard (`/api/admin`), bounded student CSV, KPI catalog. No rankings, no job force-success.
- **19** Student academic workspace: attention list, deadline groups, official search, composed dashboard. GPA still server-side.
- **20** Lecturer teaching workspace (`/api/lecturer`): assignment-scoped dashboard, offering workspace, prefix search. Resource/CA/calendar writes stay in owning modules. No CA approval, result mutation, Study Room, or invented workload policy.
- **29** System-wide QA on 2026-10-20. Backend 272/272 and frontend 38/38 passed, 0 skipped. Production dependency audit was clean after `proxy-addr` 2.0.8. See `docs/qa/prompt-29-report.md`. Load, restore, and browser E2E were not run.
- **30** Deployment hardening: compose binds Mongo and Redis to localhost, caps API/worker resources, adds an API healthcheck, and requires `https://` on `API_PUBLIC_URL`. Compose config validated; containers were not started. Decision: not production ready. See `docs/qa/prompt-30-report.md`.

GPA class bands and grade map: copied from the inspected DICT-SEUSL GPA Calculator (`gpa-engine.js`), not invented in this changelog.
