# Prompt 32 — final completion audit

**Date:** 2026-10-21  
**Commit inspected:** `a5ce73b`  
**Working tree:** uncommitted Prompt 31 handbook files (`docs/handbook.md`, `docs/README.md`, `docs/changelog.md`, `docs/qa/prompt-31-report.md`)  
**Environment:** developer workstation. Tests used `mongodb-memory-server`. No hosted deploy.

This audit read the code and re-ran the suites. Earlier prompt reports were not treated as proof.

## Decision

**NOT PRODUCTION READY**

The academic product implemented in this repository passes its automated security and integrity tests. Production hosting, backup restore, alerting, and 1,000-user capacity were not shown. Those are release blockers for a production claim. They are not evidence that the academic rules are wrong.

## Tests this run

| Suite | Result |
|---|---|
| Backend | 272 passed, 0 failed, 0 skipped |
| Frontend | 20 files, 38 passed, 0 failed |

Duration of the backend run was about 8 minutes. No test was skipped.

## Module status

| Module | Status | Basis |
|---|---|---|
| 1. Identity and academic foundation | PASS for the tested API | Three roles only in `roles.js`. No HOD. Context owns current semester. |
| 2. Learning environment | PASS for the tested API | Offering-scoped resources; unassigned lecturer and student management are denied in the learning tests that passed. |
| 3. Study Room | PASS for the tested boundary | Every ordinary route uses `requireRole(STUDENT)`. Lecturer socket connect is denied in the study-room tests. Ciphertext storage was asserted in that suite. |
| 4. Results | PASS for the tested import | Match is registration number + subject code. Repeat file updates the same row. Unmatched rows do not create students. |
| 5. GPA/CGPA | PASS for the tested engine | Server snapshot. Stale fingerprint does not return a number. Formula is the inspected DICT map, not a new policy. |
| 6. CA recovery | PASS for the tested workflow | E(CA) condition is idempotent. Complete does not write a grade. Lecturer approve alias is rejected. |
| 7. Communication | PASS for the tested routes | Notice scope, notification IDOR, unsigned WhatsApp webhook, and idempotent reminders passed. |
| 8. File infrastructure | PARTIAL | Central file module, executable names rejected, unconfigured scanner does not mark clean. Production object storage is not configured. |
| 9. Audit and security | PASS for the tested routes | Cross-department audit read is denied. Audit documents are not edited by the runbooks. |
| 10. Workers and operations | PARTIAL | Separate worker, SIGTERM drain, health live/ready. No live multi-instance deploy, no alert sink, no restore drill. |

## Scorecard

| Gate | Status | Blocking for production? |
|---|---|---|
| Identity/Auth | PASS | No |
| RBAC | PASS | No |
| Academic foundation | PASS | No |
| VLE | PASS | No |
| Study Room | PASS | No |
| Results | PASS | No |
| GPA/CGPA | PASS | No |
| CA recovery | PASS | No |
| Communication | PASS | No |
| Files | PARTIAL | Yes, until a private production store is in use |
| Security | PARTIAL | No open P0 in the suites; production TLS host was not observed |
| Testing | PARTIAL | Automated suites passed; no browser end-to-end |
| Deployment | PARTIAL | Compose file exists; `docker compose up` was not run |
| Backup/Restore | FAIL | Not demonstrated |
| Documentation | PARTIAL | Handbook and runbooks exist; API catalog was not re-diffed route by route |

## Engineering questions

| # | Question | Answer |
|---|---|---|
| 1 | Stable identity? | Yes. One user account. Registration number is academic identity, not login. |
| 2 | Server-side RBAC? | Yes. Routes use role middleware. UI hiding is not the control. |
| 3 | Department isolation? | Yes in the tested admin, audit, and notice routes. |
| 4 | Current context authoritative? | Yes. `StudentAcademicContext.currentSemesterId`. Dashboards do not invent a calendar semester. |
| 5 | Subject vs offering? | Yes. Catalog subject is separate from a batch/year/semester offering. |
| 6 | Repeat students? | Yes. One student. A later file updates the same official row and does not move context. |
| 7 | Result match? | Registration number + subject code. |
| 8 | Import idempotent? | Yes for the same open checksum and a repeat commit of the same import, in the results tests. |
| 9 | E(CA) detection? | Yes. Duplicate detect jobs do not create two conditions. |
| 10 | CA state machine? | Yes for the transitions covered by the CA tests. |
| 11 | GPA centralized? | Yes. `gpa-engine.js` on the server. Frontend does not calculate it. |
| 12 | Official resources scoped? | Yes for assignment and publication/scan gates in the learning tests. |
| 13 | Study Room student-only? | Yes on the router and in the lecturer denial tests. |
| 14 | Private chat E2E as implemented? | Ciphertext is what the server stores. Not Signal. No group-key rotation. Trust-on-first-use. |
| 15 | Plaintext absent from persistence? | The study-room test asserts the stored payload does not contain the plaintext secret. A full log-corpus review was not done. |
| 16 | Uploads scanned? | They stay unavailable until the scan is safe. |
| 17 | Scanner failure publishes? | No. Unconfigured scanner does not mark clean. |
| 18 | File id bypass? | Download requires an available safe file and the caller's scope. A raw object URL was not tested because production storage is absent. |
| 19 | Notification retries safe? | Retries are bounded. Mandatory notices still fan out. Provider failure does not write a grade. |
| 20 | Jobs idempotent? | E(CA) detect and reminder duplicates are covered. Not every job name was re-proved in isolation tonight. |
| 21 | Scheduled jobs duplicate-safe? | Reminder duplicates are idempotent in the communication tests. |
| 22 | MongoDB protected? | Compose publishes it on `127.0.0.1` only. A production network policy was not deployed. |
| 23 | Redis use? | Queue, rate limit, socket adapter. Not the store for official results. |
| 24 | Object storage private? | NOT VERIFIED. `local_dev` is rejected in production and no bucket was configured. |
| 25 | Rate limits? | Login and API limiters exist. They are process-local when Redis is down. |
| 26 | Failures observable? | Live, ready, and ops routes exist. No external alert is configured. |
| 27 | Restorable? | NOT VERIFIED. |
| 28 | Rollback safe? | Documented. Not executed on a running release. |
| 29 | Docs match reality? | Handbook entry points match the tree. API catalog drift was not fully rechecked. |
| 30 | Blockers resolved? | No. Operational blockers below remain. |

## Findings

### P0

None in the application tests that ran.

### P1

- No demonstrated backup restore.
- No private production object storage in use.
- No external alerting.
- No evidence the system sustains 1,000 concurrent users.

### P2

- No Playwright/Cypress journey.
- Compose MongoDB is a single node, so batch progression transactions fail until the URI is a replica set.
- Dev-only Vitest/`tinypool` advisories remain. Production `npm audit --omit=dev` was clean after `proxy-addr` 2.0.8 on 2026-10-20. That audit was not repeated in this run.
- Secret scan fails on this workstation because gitignored `.env` files contain a database password. They are not tracked.

### P3

None recorded.

## Performance

Not measured. No p95, p99, websocket load, upload throughput, or worker throughput. Do not treat the 82-student dashboard ceiling from an older test as a capacity result. That assertion was not the point of this run, and its elapsed time was not printed.

## Remaining plan

1. Put production files on a private bucket and prove a failed store does not mark the file available.
2. Take a Mongo backup and restore it onto a throwaway cluster. Read one registration + subject result afterward.
3. Run the compose stack once and record live, ready, login, and one student read.
4. Add an alert on ready-check failure and queue depth. Do not invent an uptime number.
5. Only after those exist, run a 1,000-student load and record the numbers the tool prints.

## Accepted risks until that work is done

- Department staging can use the tested API. It is not a hosted production claim.
- GPA map remains the inspected calculator snapshot, institutionally unconfirmed.
- Email is the login identifier.
- Chat is the implemented cryptography, not a certified messenger.
- Redis loss drops jobs and does not delete official results. There is no outbox.
