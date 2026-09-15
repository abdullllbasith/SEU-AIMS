# API route ownership

Prefixes are reserved. Endpoints are added by later prompts. Do not document unimplemented behavior as complete.

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

## Student experience (Prompt 11)

Authenticated self-service under `/api/me`. There is no student-id path parameter.

- `GET|PATCH /api/me/profile` — display name and phone/WhatsApp. Registration number, email, department, batch, and role cannot be changed here.
- `POST /api/me/profile/photo` and `GET /api/me/profile/photo` — JPEG/PNG/WebP through the files scan pipeline.
- Student-only: `GET /api/me/dashboard`, `/academic-context`, `/academic-history`, `/performance`.

Dashboard composes notices, calendar, notifications, results, GPA, CA, and current offerings. GPA with no counted credits is returned as unavailable, not `0.00`.

