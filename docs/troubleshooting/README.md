# Troubleshooting

Ops incidents: [ops/runbooks/README.md](../ops/runbooks/README.md).

## Local API will not start

- Missing `AUTH_JWT_SECRET`
- `NODE_ENV=production` with localhost CORS, `local_dev` storage, or no Redis/Mongo — read the thrown `Production configuration is incomplete` list
- Port 3001 in use

## Worker idle while API is busy

Redis not shared. Start Redis, set `REDIS_URL`, restart **both** API and worker.

## Login works, Study Room 403

Lecturer or admin session. Study Room is student-only.

## Student sees another student’s results

Should not happen. If it does, treat as a **security incident**: preserve logs (no secrets), do not “fix” by editing `AcademicResult` in the shell first. Tests: `object-authorization.test.js`.

## Result import PARSE_FAILED

File is not extractable registration + subject code + result. Do not invent name matching. Do not hand-edit official rows as the first step; fix the file and re-import.

## CA window “not open”

Window unpublished, suspended, or outside `opensAt`/`closesAt` (inclusive close). Not a parser bug.

## Duplicate CA application

One **active** application per student+year+semester. Historical `COMPLETED`/`RESOLVED` can be followed by a new cycle if E(CA) returns.

## Notifications in-app but no email/WhatsApp

Adapters noop or provider down. Academic commit stays. Do not delete notification rows to “retry”; delivery jobs retry with `NOTIFICATION_RETRY_MAX`.

## File never downloadable

Unconfigured scanner, failed scan, or unpublished official resource. Leave unavailable. Do not mark clean.

## CSRF 403 on POST

Need `GET /api/auth/csrf` and `X-CSRF-Token`. Cookies HttpOnly except CSRF cookie.

## QR verify shows no grades

By design. `GET /api/ca/verify/:token` is application id + workflow/physical status only.

## Job failed

See `/api/ops/queues` (admin). Failed Redis list is capped. Re-enqueue by repeating the **domain** action (idempotent where designed). No “force success” flag.
