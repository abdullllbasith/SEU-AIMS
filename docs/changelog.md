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

GPA class bands and grade map: copied from the inspected DICT-SEUSL GPA Calculator (`gpa-engine.js`), not invented in this changelog.
