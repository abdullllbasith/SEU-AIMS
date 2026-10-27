# Prompt 29 — system-wide QA report

**Date:** 2026-10-20  
**Machine:** developer workstation, Node 20, `mongodb-memory-server` for backend tests.  
**Not run:** hosted deploy, backup restore, 1,000-user load, browser E2E, multi-instance Socket.IO.

This pass inspected the existing suites and executed them. It did not invent academic rules. One production dependency was upgraded after the audit reported it.

## Scorecard

| Area | Status |
|---|---|
| QA overall | PARTIAL |
| Functional | PASS for the automated suites that exist |
| Security | PARTIAL |
| Academic integrity | PASS for the automated result, GPA, and CA suites |
| Reliability | PARTIAL |
| Performance | NOT TESTED at the approved scale |
| Observability | PARTIAL |
| Documentation | PASS for relative doc links |

**Final decision: RELEASE READY WITH ACCEPTED RISKS**

That decision is for a controlled department staging handover. It is not a claim of production hosting, disaster recovery, or 1,000-user capacity.

## Tests executed

| Suite | Result |
|---|---|
| Backend `npm test -w backend` | 272 passed, 0 failed, 0 skipped, 0 todo. Duration 446,048 ms |
| Frontend `vitest run` | 20 files, 38 passed, 0 failed. Duration 27.83 s |
| `npm run check:docs` | Documentation relative links resolved |
| `npm run audit:prod` after the dependency fix | 0 vulnerabilities |
| `npm run check:secrets` on this working tree | Failed |

The secret-scan failure is the two gitignored files `.env` and `backend/.env` (`mongo-password-uri`). `git check-ignore` matches both, and `git ls-files` does not track them. A checkout without those local files is what the script is written to pass. The passwords were not copied into this report.

`npm audit` including dev dependencies still reports Vitest `@vitest/mocker` (moderate) and `tinypool` (critical advisories). The offered fix is `vitest@5.0.5`, a breaking test-runner upgrade. Those packages are not in `npm audit --omit=dev`. They were not force-upgraded in this pass.

## Dependency fix

`proxy-addr` 2.0.7 was reported as GHSA-jqcg-44mw-7w3h / CVE-2026-90711 (critical): a short-prefix IPv4-mapped IPv6 trust subnet can trust every IPv4 address, so `X-Forwarded-For` can control `req.ip`.

This API sets `trust proxy` to the hop count `TRUST_PROXY` (default 1), not an IPv6 subnet. The buggy subnet compiler is therefore not the configuration in use. The package was still upgraded to 2.0.8, and the root `package.json` override pins `proxy-addr` to 2.0.8 because Express declared `~2.0.7`.

Production audit after that install: 0 vulnerabilities.

## Critical questions

Answers use tests that passed in this run. "PARTIAL" means the suite covers the rule but not every failure mode in Prompt 29.

| # | Question | Result | Evidence |
|---|---|---|---|
| 1 | Can a student see another student's results? | No, in the tested API | `student_cannot_read_another_students_result_or_dashboard`; results test "student sees only own results" |
| 2 | Can a lecturer access Study Room? | No, in the tested API and socket connect | `lecturers still cannot access Study Room`; `socket join is authorized and lecturers cannot connect` |
| 3 | Can a student change their role? | No, in the tested profile update | `profile_mass_assignment_cannot_change_role_or_department` |
| 4 | Can admin A read department B audit? | No, in the tested audit route | `cross_department_admin_cannot_read_other_department_audit` |
| 5 | Can a lecturer open an unassigned offering? | No, in the tested routes | lecturer-workspace and learning-environment IDOR tests |
| 6 | Can a result import create a student? | No, in the tested import | unmatched registration is not committed and does not create a student |
| 7 | Can a repeat file update the same official row? | Yes, in the tested import | repeat-student later file updates the same row and does not move academic context |
| 8 | Can a stale GPA be shown as current? | No, on the student read that was tested | GPA read does not recalculate; a mismatched fingerprint is returned as `STALE` without a number |
| 9 | Can E(CA) create duplicate conditions? | No, in the tested jobs | duplicate ECA detect jobs do not create two incomplete CA rows |
| 10 | Can a student bypass CA approval? | No, in the tested transitions | CA complete does not write a grade; lecturer approve alias is 403 |
| 11 | Can an executable upload skip the filename check? | No, in the tested uploads | learning and result imports reject executable filenames |
| 12 | Can an unconfigured scanner mark a file clean? | No, in the tested adapter | `unauthenticated` boundary test: unconfigured scanner does not mark files clean; production refuses `dev_trust` |
| 13 | Can a storage URL skip authorization? | PARTIAL | download policy requires an available, safe file; production object-storage URLs were not exercised because only `local_dev` writes files |
| 14 | Can private-chat plaintext be stored? | No, in the tested message | stored ciphertext does not include the plaintext secret |
| 15 | Can an invalid Study Room socket join succeed? | No, for the lecturer connect that was tested | lecturer socket `connect_error`; join after logout/disable is denied in the same file |
| 16 | Can duplicate reminder jobs send twice? | No, in the tested calendar job | duplicate reminder jobs are idempotent |
| 17 | Can an unsigned WhatsApp webhook be accepted? | No, in the tested route | unsigned webhook rejected; mismatched signature rejected |
| 18 | Can obvious secrets be logged by the redaction helper? | PARTIAL | `logging-redaction` unit tests passed; a full log-corpus review was not done |
| 19 | Can a worker cross departments? | PARTIAL | jobs run with the records they are given; there is no separate cross-department worker test |
| 20 | Can a migration corrupt history? | NOT TESTED | no migration runner was executed |
| 21 | Can the API run when Redis is down? | PARTIAL | unit tests use the in-memory queue when Redis is absent; a live Redis kill was not performed |
| 22 | Can a scanner outage publish a file as clean? | No, for the unconfigured adapter | fail-closed scanner test |
| 23 | Can missing object storage report success? | PARTIAL | file reconciliation reports a missing object; a production storage outage was not staged |
| 24 | Can the system handle 1,000+ users? | NOT TESTED | the only timing assertion is the admin dashboard under 8,000 ms for 82 synthetic students. The elapsed value was not printed. That is not a capacity test |
| 25 | Is there evidence for the critical claims above? | Yes, for the rows marked No/Yes | this file cites the tests from the 2026-10-20 run |

## Findings

### P0

None left open in the application tests.

The `proxy-addr` advisory was closed by upgrading to 2.0.8. It was not reproduced against this API's hop-count trust setting.

### P1

None in the executed application tests.

Dev-only `tinypool` advisories remain. They are not in the production dependency set. Forcing Vitest 5 was not done.

### P2

`npm run check:secrets` fails on this workstation because local gitignored `.env` files contain a database password. They are not in git.

### P3

None recorded.

## Performance

| Measure | Result |
|---|---|
| Peak users | NOT TESTED |
| API p95 / p99 | NOT TESTED |
| Websocket load | NOT TESTED |
| Upload throughput | NOT TESTED |
| Worker throughput | NOT TESTED |
| Dashboard timing assertion | Passed for 82 synthetic students, ceiling 8,000 ms. Exact elapsed time was not logged |

## Accepted risks

- No 1,000-user or concurrent-user measurement.
- Backup restore not demonstrated.
- No Playwright/Cypress browser journey. Frontend coverage is Vitest.
- Production object storage, live email, WhatsApp, and malware scanner are not configured here.
- Socket.IO across more than one API process was not load-tested.
- GPA grade map is the inspected DICT calculator snapshot and remains institutionally unconfirmed.
- Email remains the login identifier.
- Audit retention is not an approved legal schedule.
- Dev-dependency advisories in Vitest/`tinypool` remain until a planned test-runner upgrade.

## Release blockers

No open P0 in the suites that ran.

The items under accepted risks block a claim of production-complete hosting. They do not, by themselves, show a broken academic workflow in the automated tests.
