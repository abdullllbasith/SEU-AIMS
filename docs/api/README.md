# API route ownership

Prefixes are implemented by the modules below. Unversioned `/api`. Do not treat this list as OpenAPI completeness; see owning module routers.

See also [frontend-routes.md](./frontend-routes.md).

| Prefix | Owner |
|---|---|
| `/api/health` | application composition |
| `/api/auth` | authentication |
| `/api/academic` | academic-foundation |
| `/api/learning` | learning-environment |
| `/api/study-room` | study-room |
| `/api/results` | results |
| `/api/gpa` | gpa-cgpa |
| `/api/ca` | ca-recovery |
| `/api/notices` | notices-calendar |
| `/api/calendar` | notices-calendar |
| `/api/notifications` | notifications |
| `/api/me` | student-experience |
| `/api/files` | files |
| `/api/audit` | audit-security |
| `/api/ops` | audit-security (admin operational counts) |
| `/api/webhooks` | audit-security (provider callbacks) |
| `/api/admin` | admin-operations (department operational reads) |
| `/api/lecturer` | lecturer-workspace (assignment-scoped teaching composition) |

No API version prefix unless a later decision requires one.

## Academic foundation (Prompt 05)

Department administrators manage structure under `/api/academic`. Students use `GET /api/academic/me/context` and `GET /api/academic/me/offerings`. Lecturers use `GET /api/academic/me/offerings` and may read an offering only when actively assigned. Mutating routes require CSRF. Records are archived rather than deleted.

## Learning environment (Prompt 06)

Official resources live under `/api/learning`. They belong to a subject offering. Students list current/historical offerings and download only published, scanned-safe files. Lecturers and department administrators manage sections/resources for authorized offerings. Upload is distinct from publish. Mutating routes require CSRF.

## CA recovery (Prompt 09)

`/api/ca` orchestrates incomplete-CA conditions, application windows, applications, PDFs, and lecturer schedules. Official grades stay in `/api/results`. Completing a CA does not write a result.

Public (rate-limited): `GET /api/ca/verify/:token` — application ID plus workflow/physical status only.

Student: `GET /api/ca/conditions`, `GET /api/ca/windows/me`, `GET|POST /api/ca/applications`, `GET|PATCH /api/ca/applications/:applicationId`, `POST .../submit`, `GET .../pdf`.

Admin: `GET|POST /api/ca/admin/windows`, `GET /api/ca/admin/applications`, `POST .../verify|approve|reject|reopen`.

Lecturer: `GET /api/ca/lecturer/eligible-students`, `GET|POST /api/ca/lecturer/schedules`, `POST .../schedules/:scheduleId/cancel`, `POST /api/ca/lecturer/applications/:applicationId/complete`.

Mutating routes require CSRF except the public verify GET.

## Communication (Prompt 10)

`/api/notifications` is the inbox and delivery control plane. `GET /` (in-app only), `GET /unread-count`, `PATCH /:id/read`, `POST /mark-all-read`, `GET|PATCH /preferences`, admin `GET /admin/summary` (counts only).

`/api/notices` is the notice board. Students/lecturers see published, in-scope notices. Admins use `/admin` create/update/publish/archive.

`/api/calendar` lists scoped events (`/events`, `/upcoming`). Admins manage `/admin/events`. Lecturers create assignment deadlines at `/lecturer/events` only for assigned offerings. CA_SCHEDULE events are read-only on this API.

## Audit, health, and webhooks (Prompt 12)

- `GET /api/health`, `/api/health/live`, `/api/health/ready`
- Admin: `GET /api/audit/events`, `GET /api/audit/summary`, `GET /api/ops/metrics`, `GET /api/ops/integrity`
- Department operations (Prompt 18): `GET /api/admin/dashboard` and related reads under `/api/admin`. See [admin-operations.md](../ops/admin-operations.md).
- CA recovery (Prompt 23): department admin `GET /api/ca/admin/reconciliation` (read-only) and `POST /api/ca/admin/backfill` (creates missing E(CA) conditions only). Completing a CA still does not write a grade.
- GPA (Prompt 22): student `GET /api/gpa/me`. Department admin `GET /api/gpa/admin/quality` and `POST /api/gpa/admin/rebuild` (CSRF). Calculation version `DICT-SEUSL-GPA-1`. A read does not recalculate.
- Results processing (Prompt 21): department admin `POST /api/results/imports/:id/reject|reprocess`, `GET /api/results/records`, `GET /api/results/records/:resultId/versions`, `GET /api/results/analytics`, `GET /api/results/reconciliation`. Students keep `GET /api/results/me` only. See [result-processing.md](../ops/result-processing.md).
- Communication checks (Prompt 24): department admin `GET /api/calendar/admin/reconciliation`. Counts open deliveries and reminders for cancelled calendar events. It does not fail a delivery because it is old, and it does not apply quiet hours.
- Lecturer workspace (Prompt 20): `GET /api/lecturer/dashboard`, `/subject-offerings`, `/subject-offerings/:id`, `/search`, `/upcoming`, `/assignments`, `/ca-recovery/eligible-students`, `/ca-recovery/schedules`. Mutating aliases for CA approval, results, and resource writes are rejected. See [lecturer-workspace.md](../ops/lecturer-workspace.md).
- Audit mutation routes are rejected.
- `GET|POST /api/webhooks/whatsapp` — verify token / HMAC; unsigned posts fail closed


## Student experience (Prompt 11)

Authenticated self-service under `/api/me`. There is no student-id path parameter.

- `GET|PATCH /api/me/profile` — display name and phone/WhatsApp. Registration number, email, department, batch, and role cannot be changed here.
- `POST /api/me/profile/photo` and `GET /api/me/profile/photo` — JPEG/PNG/WebP through the files scan pipeline.
- Student-only: `GET /api/me/dashboard`, `/upcoming`, `/search`, `/academic-context`, `/academic-history`, `/performance`.

Dashboard composes notices, calendar, notifications, results, GPA, CA, and current offerings. GPA with no counted credits is returned as unavailable, not `0.00`. Search is prefix-only over authorized offerings and published official resources.

