# Admin operational analytics

Department Administrators use this layer to **watch** the department VLE. Authoritative writes stay on academic, results, CA, notices, and authentication APIs.

Module: `backend/src/modules/admin-operations`. HTTP prefix: `/api/admin`. UI: `/admin`.

## Metric ownership

| KPI | Source domain | Calculation | Refresh | Authorization |
|---|---|---|---|---|
| activeStudents | authentication | `User` STUDENT + ACTIVE + principal department | on-request, cache ≤15s | Department Administrator |
| activeLecturers | authentication | `User` LECTURER + ACTIVE + department | on-request, cache ≤15s | Department Administrator |
| activeBatches | academic-foundation | `Batch` ACTIVE | on-request, cache ≤15s | Department Administrator |
| activeSemesters | academic-foundation | `Semester` ACTIVE | on-request, cache ≤15s | Department Administrator |
| activeSubjectOfferings | academic-foundation | `SubjectOffering` ACTIVE | on-request, cache ≤15s | Department Administrator |
| unpublishedOfficialResources | learning-environment | official resources DRAFT or UNPUBLISHED, not deleted | on-request, cache ≤15s | Department Administrator |
| pendingResultImports | results | import statuses before COMMITTED/FAILED family | on-request, cache ≤15s | Department Administrator |
| unresolvedEcaConditions | ca-recovery | `IncompleteCa` OPEN | on-request, cache ≤15s | Department Administrator |
| pendingCaApplications | ca-recovery | SUBMITTED or UNDER_VERIFICATION | on-request, cache ≤15s | Department Administrator |
| upcomingCaAssessments | ca-recovery | `CaSchedule` not cancelled, `scheduledAt` ≥ now | on-request, cache ≤15s | Department Administrator |
| failedNotifications | notifications | `Notification` FAILED | on-request, cache ≤15s | Department Administrator |
| failedBackgroundJobs | operations | queue failed list length | on-request | Department Administrator (not department-split) |
| deniedAuditEvents | audit-security | `AuditEvent` DENIED | on-request, cache ≤15s | Department Administrator |

Code catalog: `backend/src/modules/admin-operations/constants.js`.

There are **no** rankings, risk scores, or leaderboards.

## Read-model design

Counts are computed from source collections. The only cache is an in-process map keyed by department id (15s TTL), same class of cache as the student dashboard. Rebuild: wait or restart the API process. Failure: next request recomputes.

`departmentId` on the query string or body does **not** change scope.

## APIs

All require a Department Administrator session. CSRF applies to the few POST/PATCH routes, which exist only to **reject** mutation and job force-success.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/dashboard` | KPI cards |
| GET | `/api/admin/metrics` | same as dashboard |
| GET | `/api/admin/students` | paginated prefix search |
| GET | `/api/admin/students/:userId` | read composition |
| GET | `/api/admin/lecturers` | paginated |
| GET | `/api/admin/lecturers/:userId` | assignments |
| GET | `/api/admin/offerings` | offering health |
| GET | `/api/admin/result-imports` | import summaries |
| GET | `/api/admin/result-imports/:importId` | monitor + audit slice |
| GET | `/api/admin/ca-recovery/overview` | CA counts |
| GET | `/api/admin/ca-recovery/applications` | application queue (read) |
| GET | `/api/admin/notifications/health` | delivery counts |
| GET | `/api/admin/calendar/health` | in-app calendar/notice counts |
| GET | `/api/admin/storage/health` | explains why file counts are withheld |
| GET | `/api/admin/jobs` | queue snapshot; retry unsupported |
| GET | `/api/admin/audit` | same listing rules as `/api/audit/events` |
| GET | `/api/admin/security` | denied events |
| GET | `/api/admin/data-quality` | integrity diagnostics (no auto-repair) |
| GET | `/api/admin/exports/students.csv` | bounded directory export |

Commit/preview of results remains `/api/results`. CA approve/reject remains `/api/ca/admin`.

## Exports

Student CSV columns: registration number, display name, email, account status, batch, year, semester. Cap **500** rows. Formula-like cells are prefixed. Export is audited as `admin.export.students`. Password hashes are never selected.

## Bulk operations

The supported bulk academic path is the existing **result import** (upload → parse → preview → confirm → commit). This module does not CSV-write grades or force jobs to succeed.

## Search

Registration and name searches are **prefix** matches. Regex metacharacters are rejected. Page size max 50.

## Known gaps

- File storage counts are not department-scoped (`StoredFile` has no `departmentId`).
- Queue depth is not partitioned by department.
- Failed job retry is not implemented (payload not retained on the failed list).
- Async report jobs / cancellation are not implemented; export is synchronous and capped.
- Browser E2E is not in this repository; admin walkthrough is an API integration test.
