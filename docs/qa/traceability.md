# Requirement traceability

Status reflects **automated** evidence in this repository. Human UAT is separate.

| Requirement | Module | Implementation | Test | Security test | E2E/smoke | Status |
|---|---|---|---|---|---|---|
| Three roles only | authentication | `ROLES` | `roles.test.js` | auth-boundary | smoke login | Verified |
| Session auth + CSRF | authentication | cookies, csrf | authentication.test.js | default-deny | smoke | Verified |
| Academic structure | academic-foundation | models/services | academic-foundation.test.js | lecturer offering | smoke offerings | Verified |
| Official resources on offering | learning-environment | learning.service | learning-environment.test.js | unassigned lecturer | module | Verified |
| Study Room student-only | study-room | requireRole STUDENT + sockets | study-room.test.js | object-authorization | frontend ProtectedRoute | Verified |
| Result identity = registration + subject code | results | unique index + parsers | results.test.js, result-parsers | studentId query 403 | smoke results | Verified |
| Repeat-student update same record | results | commit upsert | results.test.js | — | — | Verified |
| GPA from official results | gpa-cgpa | gpa-engine DICT | gpa-engine.test.js | — | orchestration GPA job | Verified |
| E(CA) → incomplete CA | ca-recovery | syncIncompleteCaFromResult | results + ca-recovery | — | orchestration ECA job | Verified |
| CA workflow + physical verify | ca-recovery | application.service | ca-recovery.test.js | application IDOR | — | Verified |
| Notices → notifications | notices-calendar / notifications | fanout | communication.test.js | notification IDOR | smoke notices | Verified |
| Calendar representation | notices-calendar | CalendarEvent source ids | ca-recovery + communication | calendar event IDOR | smoke calendar | Verified |
| Dashboard composition | student-experience | getStudentDashboard | student-experience.test.js | dashboard isolation | smoke dashboard | Verified |
| Profile forbidden fields | student-experience | PROFILE_FORBIDDEN_FIELDS | mass-assignment-injection | same | — | Verified |
| Audit append-only | audit-security | hooks + recordAudit | audit-security.test.js | mutation 400 | ops smoke | Verified |
| WhatsApp HMAC | audit-security | webhook.service | observability-webhooks | unsigned 401 | — | Verified |
| Worker drain | workers | processQueuedJobs | orchestration.test.js | — | — | Verified |
| Integrity diagnostic | audit-security | runIntegrityChecks | audit-security + smoke | student 403 | smoke | Verified |
