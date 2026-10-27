# Prompt 33 — master requirements reconciliation

**Project:** SEU-AIMS  
**Commit:** `a5ce73b`, plus the uncommitted handbook files from Prompt 31 and this report  
**Environment:** developer workstation, `mongodb-memory-server`  
**Date:** 2026-10-21  
**Authority:** `Architecture/Prompt_33_Master_Requirements_Reconciliation_And_Idea_Lock.md`, then the approved architecture. This file does not weaken either.

The locked product is a department VLE/LMS: three roles, academic hierarchy, official resources separate from the student Study Room, lecturers out of Study Room, private chat stored as ciphertext, results matched by registration number and subject code, E(CA) into a physical CA workflow, server-side GPA, and a modular monolith. Scale target is 1,000+ students, then several thousand. Unlimited scale is not claimed.

The matrix below is the set reconciled in this pass. It is not a claim that every numbered paragraph in the Architecture prompt was re-tested one by one.

## Overall

**NOT PRODUCTION READY**

| | Count |
|---|---|
| Locked rows in this matrix | 43 |
| PASS | 35 |
| PARTIAL | 5 |
| FAIL | 0 |
| NOT VERIFIED | 3 |
| BLOCKED | 0 |

Critical rows (identity, academic, results, CA, GPA, Study Room access, file scan, security): 31 rows, 28 PASS, 3 PARTIAL, 0 FAIL.

| Area | Status |
|---|---|
| Security | PARTIAL |
| Academic integrity | PARTIAL |
| Functional | PASS for the tested workflows |
| Reliability | PARTIAL |
| Performance | NOT VERIFIED |
| Operations | PARTIAL |
| Documentation | PARTIAL |

Evidence for the PASS rows is the 2026-10-21 suite: backend 272 passed, 0 failed, 0 skipped; frontend 38 passed. Code cited below was read in this pass.

## Matrix

| ID | Requirement | Module | Evidence | Test | Status |
|---|---|---|---|---|---|
| REQ-IDENTITY-001 | Only student, lecturer, and department administrator | authentication | `roles.js` has those three values and forbids HOD | role and auth tests in the 272 | PASS |
| REQ-IDENTITY-002 | Email is login; registration number is academic identity | authentication | Login and profile tests; profile cannot change role or registration | `authentication.test.js`, profile mass-assignment test | PASS |
| REQ-IDENTITY-003 | No HOD account | authentication | No HOD role. Physical signature is on paper | CA README and `roles.js` | PASS |
| REQ-ACADEMIC-001 | Department, batch, year, semester, subject, offering | academic-foundation | Models and academic admin API | `academic-foundation.test.js` | PASS |
| REQ-ACADEMIC-002 | A subject is not a subject offering | academic-foundation | Separate models. Offering points at a subject | academic and learning tests | PASS |
| REQ-ACADEMIC-003 | Current semester is the student context field | academic-foundation | `StudentAcademicContext.currentSemesterId` | source-of-truth doc matches the model | PASS |
| REQ-ACADEMIC-004 | History is kept; the dashboard uses the current context | student-experience | History route; dashboard does not invent a calendar semester | student-experience tests | PASS |
| REQ-ACADEMIC-005 | A repeat file does not move the student to another period | results | Repeat import test keeps context | `results.test.js` | PASS |
| REQ-RESULT-001 | Match registration number + subject code, not name | results | Import service and test name | `results.test.js` | PASS |
| REQ-RESULT-002 | PDF and XLSX imports | results | Both parsers; empty or unmatched files fail closed | parser and results tests | PASS |
| REQ-RESULT-003 | Preview, then commit | results | Import preview and commit routes | results tests | PASS |
| REQ-RESULT-004 | Committing the same import twice is safe | results | Idempotent commit test | `results.test.js` | PASS |
| REQ-RESULT-005 | A later file updates the same official row | results | Repeat-student test | `results.test.js` | PASS |
| REQ-RESULT-006 | A student sees only their own results | results | Own-results test; other student id is 403 | results and object-authorization tests | PASS |
| REQ-RESULT-007 | A lecturer cannot export the result book | results | Lecturer `GET /api/results/me` and imports are 403 | `results.test.js` | PASS |
| REQ-CA-001 | E(CA) opens one incomplete condition; a duplicate job does not open a second | ca-recovery | Detect job and reconciliation | CA and orchestration tests | PASS |
| REQ-CA-002 | Finishing CA does not write a grade | ca-recovery | Complete path does not write `AcademicResult` | `ca-recovery.test.js` | PASS |
| REQ-CA-003 | PDF, QR, printed HOD signature, department admin verifies. Not a digital signature or a checkbox | ca-recovery | `pdf.service.js` says the PDF is not a digital signature. `verifyPhysical` is the admin step | CA integration test covers PDF, QR, and physical verify | PASS |
| REQ-CA-004 | Reminders at 7, 3, and 1 days | ca-recovery | Offsets in the CA unit test | `unit/ca-recovery.test.js` | PASS |
| REQ-CA-005 | Lecturer may schedule eligible students and may not approve | ca-recovery | Lecturer approve alias returns 403 | lecturer-workspace and CA tests | PASS |
| REQ-GPA-001 | One server engine. The browser does not calculate GPA | gpa-cgpa | `gpa-engine.js` | GPA tests; frontend has no grade map | PASS |
| REQ-GPA-002 | A stale snapshot is not shown as the current number | gpa-cgpa | Read returns `STALE` and omits the number | results/GPA test | PASS |
| REQ-GPA-003 | The formula is the institution's confirmed rule | gpa-cgpa | Code copies the inspected DICT calculator. Faculty confirmation is not in the repo | Documented as unconfirmed in `limitations.md` | PARTIAL |
| REQ-GPA-004 | E(CA) is excluded, not treated as E = 0 | gpa-cgpa | Engine test | `gpa-engine.test.js` | PASS |
| REQ-LEARN-001 | Official resources belong to a subject offering | learning-environment | Resource model and routes | learning tests | PASS |
| REQ-LEARN-002 | Only an assigned lecturer manages those resources | learning-environment | Unassigned lecturer is 403 | learning tests | PASS |
| REQ-STUDY-001 | Study Room API and sockets are students only | study-room | `requireRole(STUDENT)` on ordinary routes | study-room tests | PASS |
| REQ-STUDY-002 | Private chat is end-to-end as a product guarantee | study-room | Server stores ciphertext and the test checks the secret is absent. No key rotation. Trust on first use. Not Signal | study-room crypto test | PARTIAL |
| REQ-STUDY-003 | Lecturers cannot enter Study Room | study-room | Lecturer HTTP 403 and socket connect error | study-room tests | PASS |
| REQ-STUDY-004 | Review mode and non-review mode both still require a safe scan | study-room | `ADMIN_REVIEW` and `NON_REVIEW` in `resource.service.js`. Scan failure stays unavailable | study-room tests and module README | PASS |
| REQ-FILE-001 | One file pipeline. A file is not downloadable before a safe scan | files | Shared file module | learning, profile, and file tests | PASS |
| REQ-FILE-002 | A missing scanner does not mark a file clean | files | Adapter fails closed. Production refuses `dev_trust` | `auth-boundary.test.js` | PASS |
| REQ-FILE-003 | Production files live in private object storage | files | Production config rejects `local_dev`. No bucket was configured or tested | Prompt 30 and 32 | PARTIAL |
| REQ-NOTIFY-001 | In-app, email, and WhatsApp | notifications | In-app works. Email and WhatsApp stay noop until credentials exist | communication and notification tests | PARTIAL |
| REQ-NOTIFY-002 | WhatsApp webhooks must be signed | audit-security | Unsigned and mismatched signatures are rejected | `observability-webhooks.test.js` | PASS |
| REQ-NOTIFY-003 | Notice fanout and reminder jobs do not double-send | notifications | Idempotent publish and reminder tests | `communication.test.js` | PASS |
| REQ-SEC-001 | Server-side role, department, and object checks | security | IDOR tests for results, CA, notifications, calendar, files, lecturer offerings | `object-authorization.test.js` | PASS |
| REQ-SEC-002 | Audit rows are append-only | audit-security | No mutation route. Runbooks forbid editing them | audit tests | PASS |
| REQ-OPS-001 | API and worker are separate. Redis is the shared queue when connected | workers | `api-server.js` and `worker-entry.js`. In-memory queue if Redis is absent | job-queue unit tests | PARTIAL |
| REQ-OPS-002 | More than one API instance behind a load balancer | deploy | Compose runs one API. Nginx sample is HTTP on port 8080. Not started | Prompt 30 | NOT VERIFIED |
| REQ-OPS-003 | A backup can be restored and a result can be read afterward | ops | Procedure is written. No restore was run | Prompt 30 and 32 | NOT VERIFIED |
| REQ-OPS-004 | The system carries 1,000+ students under a measured load | ops | No load run. No p95 | Prompt 32 | NOT VERIFIED |
| REQ-OPS-005 | Do not claim unlimited scale | docs | Handbook and limitations state the ceiling | this file | PASS |

## Non-PASS detail

**REQ-GPA-003.** Expected: the GPA map is the faculty's confirmed rule. Actual: `gpa-engine.js` copies the inspected DICT-SEUSL calculator and says so. Severity P2. Do not invent a replacement map. Fix: an explicit academic confirmation, or leave the limitation visible.

**REQ-STUDY-002.** Expected: private chat the server cannot read, with a stated cryptographic design. Actual: the client encrypts; the server stores ciphertext; keys are trust-on-first-use; there is no rotation. Severity P2. Do not call it Signal. Fix: only if the product later approves a stronger key scheme.

**REQ-FILE-003.** Expected: private production object storage. Actual: the production gate rejects `local_dev`, and no private bucket was used. Severity P1 for a production claim. Fix: configure the private driver and show a failed store does not mark the file available.

**REQ-NOTIFY-001.** Expected: email and WhatsApp deliver when configured. Actual: adapters are noop without credentials. In-app delivery is real. Severity P2 until the department turns the providers on. Academic records are not blocked on provider success.

**REQ-OPS-001.** Expected: a shared queue in production. Actual: Redis is required by the production config gate, and the process falls back to memory if Redis is down in development. Severity P1 if more than one API runs without Redis. Fix: keep production from booting without Redis, which the gate already does.

**REQ-OPS-002, REQ-OPS-003, REQ-OPS-004.** Not verified. Severity P1 for a production claim. No application defect was shown.

## Release blockers

No tested academic or authorization rule failed.

A production claim is still blocked by private object storage in use, a demonstrated restore, and the absence of a 1,000-user measurement.

## Idea lock

Do not add a fourth role. Do not put lecturers in Study Room. Do not match results by name. Do not write a grade when a CA is completed. Do not calculate GPA in the browser. Do not replace the printed HOD signature with a checkbox. Do not mark a file clean because the scanner is down. Do not describe the chat as a certified messenger. Do not claim unlimited scale.
