# Developer handbook

This is the map of SEU-AIMS. Product rules in the Architecture pack win if an older note conflicts. Do not invent academic policy here.

Rules that stay visible:

- Three application roles only; no HOD login.
- Study Room is students only (API, sockets, and `/study-room`).
- An official result is **registration number + subject code**.
- A dashboard composes. It does not own results or GPA.
- Completing a CA does not write a grade.
- The `/admin` dashboard aggregates. It does not edit official results or force jobs.
- The lecturer workspace composes assigned offerings. It does not approve CA or mutate results.
- Do not invent CA1/CA2, D+, or extra grade letters. See [frontend/ui-contract.md](./frontend/ui-contract.md).

## 1. System overview

SEU-AIMS is a department VLE/LMS: one React app, one Express API, and a separate worker process. Durable academic data is in MongoDB. Redis is for the shared queue, rate limits, and the Socket.IO adapter when it is connected. Files go through the file module and a malware scan before they are downloadable.

Login is email. The registration number is academic identity, not the login.

Start with [terminology.md](./terminology.md), [limitations.md](./limitations.md), and the locked requirement matrix in [qa/prompt-33-idea-lock.md](./qa/prompt-33-idea-lock.md). Do not weaken those rows to make a later change easier.

## 2. Architecture

```text
Browser
  → frontend (Vite / React)
  → API (Express, stateless)
  → MongoDB          official academic records
  → Redis            queue, rate limit, socket adapter
  → worker           scans, imports, GPA rebuild, reminders
  → file storage     local_dev in development only
```

Production shape, not observed as a live cluster in this repo:

```text
Internet
  → reverse proxy (TLS)
  → API × N
  → MongoDB
  → Redis
  → workers × M
  → private object storage
```

Security path:

```text
Identity (session)
  → role (student, lecturer, department administrator)
  → department scope
  → resource check (own row, assignment, or batch membership)
```

Module direction:

```text
authentication
  → academic-foundation
  → learning, study-room, results, CA, notices
  → GPA and notifications read the owners above
  → student-experience, lecturer-workspace, admin-operations compose
  → audit-security records mutations
files are shared infrastructure, not the owner of grades or chat
```

Read [architecture/modular-monolith.md](./architecture/modular-monolith.md), [architecture/module-boundaries.md](./architecture/module-boundaries.md), [architecture/source-of-truth.md](./architecture/source-of-truth.md), [architecture/cross-module-dependencies.md](./architecture/cross-module-dependencies.md), and [architecture/diagrams.md](./architecture/diagrams.md).

A subject is the catalog course. A subject offering is that course taught to a batch in a year and semester. Current semester is `StudentAcademicContext.currentSemesterId`, written by academic administration. Repeat results update the same official row and do not move that context. See [architecture/data-model.md](./architecture/data-model.md) and [decisions/0003-result-identity.md](./decisions/0003-result-identity.md).

## 3. Repository structure

Directories that exist at the repository root:

| Path | What it is |
|---|---|
| `frontend/` | React application |
| `backend/` | API, worker, and backend tests |
| `docs/` | This handbook and the operator notes |
| `deploy/` | Dockerfiles, compose, nginx samples |
| `scripts/` | Doc-link, secret, and bundle checks |

There is no top-level `workers/`, `shared/`, `infra/`, or `tests/` directory. Worker code is `backend/src/workers/`. Tests are `backend/tests/` and frontend `*.test.js` files.

Entry points:

| Process | File |
|---|---|
| Frontend | `frontend/src/main.jsx` |
| API | `backend/src/server/api-server.js` |
| Worker | `backend/src/workers/worker-entry.js` |
| Test setup | `backend/tests/helpers/memory-mongo.js` and `backend/tests/helpers/qa-fixtures.js` |

There is no separate scheduler process. Reminders are queue jobs drained by the worker.

Startup order for the API: load config, refuse an incomplete production config, connect Mongo and Redis, create the Express app, attach Socket.IO, listen. SIGTERM closes sockets, stops accepting HTTP, closes the queue, then disconnects Redis and Mongo.

## 4. Domain modules

Import only `backend/src/modules/<name>/index.js`. The index and the code README for each module are listed in [modules/README.md](./modules/README.md).

| Module | Owns |
|---|---|
| authentication | Credentials, sessions, three roles |
| academic-foundation | Department through subject offering, student context and history |
| learning-environment | Official resources on an offering |
| study-room | Student-only chat and shared student files |
| results | Imports and official rows |
| gpa-cgpa | Snapshots derived from official rows |
| ca-recovery | Incomplete CA conditions, applications, PDF/QR |
| notices-calendar | Notices and the calendar representation |
| notifications | Delivery records |
| student-experience | Student home composition and profile |
| lecturer-workspace | Assigned-offering composition |
| admin-operations | Department counts and directory |
| files | Stored-file metadata and scan state |
| audit-security | Append-only audit, health, webhooks |

## 5. Data model

Collections and enums: [database/dictionary.md](./database/dictionary.md).

GPA numbers come from the inspected DICT calculator snapshot in `gpa-engine.js`. A read does not recalculate. A fingerprint mismatch is `STALE` and does not show a number. See [ops/gpa.md](./ops/gpa.md). The map is not a faculty-senate confirmation.

E(CA) creates an incomplete CA condition. Completing that workflow does not write `AcademicResult`. See [ops/result-processing.md](./ops/result-processing.md).

## 6. Security

| Topic | Document |
|---|---|
| Login, cookies, CSRF | [security/authentication.md](./security/authentication.md) |
| Trust boundaries | [security/trust-boundaries.md](./security/trust-boundaries.md) |
| What each role may touch | [security/boundaries.md](./security/boundaries.md) |
| Threat notes | [security/threat-model.md](./security/threat-model.md) |
| Logging | [security/observability.md](./security/observability.md) |
| Three roles | [decisions/0002-three-roles.md](./decisions/0002-three-roles.md) |
| Study Room | [decisions/0004-study-room-student-only.md](./decisions/0004-study-room-student-only.md) |

Private Study Room messages are stored as ciphertext. The server does not hold the conversation plaintext. This is not a claim of Signal-grade key rotation. Public keys are trust-on-first-use. See the study-room module README.

Files stay unavailable until the scan is safe. An unconfigured scanner does not mark a file clean. Production rejects `FILE_STORAGE_DRIVER=local_dev`.

## 7. APIs

HTTP prefixes, CSRF, and role gates: [api/README.md](./api/README.md). Browser routes: [api/frontend-routes.md](./api/frontend-routes.md).

Department scope is the signed-in user's department. A client-supplied `departmentId` does not switch tenants. Another student's result, notification, or CA application is denied by the owning route, not by hiding a button.

## 8. Realtime

Study Room sockets attach in the API process. Lecturers cannot connect. When Redis is connected, the Socket.IO Redis adapter is used so more than one API can share rooms. Multi-instance behavior has not been load-tested. See [decisions/0005-redis-jobs-sockets.md](./decisions/0005-redis-jobs-sockets.md) and [ops/scale-out.md](./ops/scale-out.md).

## 9. Files

The file module stores metadata and scan state. Learning resources, Study Room shares, profile photos, result imports, and CA PDFs call that module. They do not write their own storage layout. Reconciliation compares records with stored objects and does not delete them. See the files module README.

## 10. Workers

`npm run dev:worker` or `npm run start:worker`. Job names and the graph: [architecture/job-graph.md](./architecture/job-graph.md).

Jobs call domain services. Duplicate E(CA) detection and reminder jobs are written to be idempotent. Redis loss drops queued work; it does not delete official results. There is no outbox.

## 11. Testing

Commands in `package.json`:

```text
npm test
npm run test:unit
npm run test:integration
npm run test:security
npm run test:frontend
npm run test:smoke
npm run check:docs
npm run check:secrets
npm run audit:prod
```

Fixtures are synthetic (`qa-fixtures.js`). Do not put real student records or production passwords in tests. Latest execution evidence: [qa/prompt-29-report.md](./qa/prompt-29-report.md). How the suites are laid out: [testing/README.md](./testing/README.md).

## 12. Deployment

[ops/deployment.md](./ops/deployment.md), [ops/environments.md](./ops/environments.md), [ops/topology.md](./ops/topology.md), [ops/secrets.md](./ops/secrets.md).

`npm ci` uses the lockfile. `npm run seed` refuses `NODE_ENV=production`. Compose config was validated on 2026-10-20. Containers were not started, and a public TLS deploy was not observed. See [qa/prompt-30-report.md](./qa/prompt-30-report.md).

Rollback is: stop the new API and worker, start the previous image, do not drop indexes automatically, then check live, ready, login, and one student result read.

## 13. Operations

[ops/README.md](./ops/README.md) and [ops/runbooks/README.md](./ops/runbooks/README.md).

Runbooks cover API outage, queue backlog, Mongo, Redis, scanner, email, WhatsApp, certificates, a failed deploy, storage, malware, notification failure, a security incident, and restore. Restore has not been demonstrated. Do not edit audit documents to repair data.

## 14. Troubleshooting

[troubleshooting/README.md](./troubleshooting/README.md).

| Symptom | Look at |
|---|---|
| Ready check says Mongo is down | `MONGODB_URI`, replica set for progression |
| Jobs never move | worker process and `REDIS_URL` |
| Upload stays unavailable | scan state; do not mark it clean |
| GPA missing | snapshot `STALE` or no counted credits; not a zero |
| Study Room 403 | caller is not a student, or the batch does not match |
| Production process will not boot | `assertProductionConfig` message: JWT, CORS, Redis, storage, `https://` public URL |

## 15. Contribution rules

[development/contributing.md](./development/contributing.md) and [development/coding-standards.md](./development/coding-standards.md).

Change the owning module. Do not copy a grade rule into the frontend. Do not add a fourth role. Update the module README and this handbook's link when a route or job name changes. `npm run check:docs` must resolve relative links.

## 16. Known limitations

[limitations.md](./limitations.md) is the list. In short: no measured 1,000-user load, no demonstrated backup restore, no production object-storage adapter in use, email/WhatsApp/scanner noop unless configured, GPA policy institutionally unconfirmed, no browser end-to-end suite.

Environment variables, without values: [development/env-reference.md](./development/env-reference.md). Local setup: [development/local-setup.md](./development/local-setup.md).
