# ca-recovery

**Owns:** Incomplete CA conditions (from official E(CA)), application windows, at most one *active* application per student+year+semester, PDF/QR, physical verification, approval/rejection/reopen, lecturer-scoped scheduling, reminder records. A COMPLETED/RESOLVED cycle may be followed by a new application if E(CA) returns; historical rows are kept.

**Must not own:** Official results, GPA formulas, email/WhatsApp provider delivery, calendar storage, or a HOD portal. Completing a CA does **not** write a grade.

## Provenance

An incomplete-CA condition stores the official result version and, when present, the source import. Resolution records `resolvedAt` and `resolutionSource: OFFICIAL_RESULT`. A later `E(CA)` on the same result reopens the condition. It does not create a second one.

`GET /api/ca/admin/reconciliation` reports drift and does not edit records. `POST /api/ca/admin/backfill` creates missing conditions for current `E(CA)` results only.

## State machine

`DRAFT` → `SUBMITTED` → `UNDER_VERIFICATION` (after physical verify) → `APPROVED` or `REJECTED`.  
`APPROVED` → `SCHEDULED` → `COMPLETED`.  
`REJECTED`/`SUBMITTED` may be reopened to `DRAFT`.  
`RESOLVED` only after official result import clears linked `IncompleteCa` rows.  
Cancelled CA schedules set `CalendarEvent.cancelledAt` so they are not active calendar events; the row remains for audit.

Physical signature is recorded as `AWAITING_PHYSICAL` / `PHYSICALLY_VERIFIED` / `VERIFICATION_FAILED`. The PDF is not a digital HOD signature.

## Notifications

Lifecycle events write `Notification` rows on `IN_APP`, `EMAIL`, and `WHATSAPP` with unique idempotency keys. Channel adapters are not invoked here; failed delivery must not roll back the application.

Reminders: 7 / 3 / 1 days before `scheduledAt`. Cancelled schedules do not send.

## PDF / QR

Template version `ca-application-v1`. QR encodes a verification URL with an opaque token. `GET /api/ca/verify/:token` returns application ID and workflow/physical status only — no grades.
