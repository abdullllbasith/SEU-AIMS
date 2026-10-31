# ca-recovery

**Owns:** Incomplete CA conditions (from official E(CA)), application windows, at most one *active* application per student+year+semester, PDF/QR, physical verification, approval/rejection/reopen, subject-level examination notices, schedules, and CA reminder records. A COMPLETED/RESOLVED cycle may be followed by a new application if E(CA) returns; historical rows are kept.

**Must not own:** Official results, GPA formulas, email/WhatsApp provider delivery, calendar storage, or a HOD portal. Completing a CA does **not** write a grade.

## Workflow

`E(CA)` → student application → PDF + QR → physical HOD signature → admin QR scan / manual verification → admin approval → lecturer notification → CA exam notice → student notifications (VLE + email + WhatsApp) → 7/3/1-day reminders → CA completed → official result review → GPA recalculation.

The last two steps are owned by `recovery-result-review.service.js` and `gpa-cgpa`. Completing a CA never changes a grade.

## Provenance

An incomplete-CA condition stores the official result version and, when present, the source import. Resolution records `resolvedAt` and `resolutionSource: OFFICIAL_RESULT`. A later `E(CA)` on the same result reopens the condition. It does not create a second one.

`GET /api/ca/admin/reconciliation` reports drift and does not edit records. `POST /api/ca/admin/backfill` creates missing conditions for current `E(CA)` results and also gives pre-existing subject links and schedules their subject-level state (idempotent). **Run it once after deploying this version.**

## Application status and subject status

One `CaApplication` per student per semester holds several `CaApplicationSubject` rows. Each row belongs to one Subject Offering and its own lecturer(s), so each subject has its own `examStatus`:

| `examStatus` | Meaning |
|---|---|
| `PENDING_APPROVAL` | the application is not approved yet |
| `READY_TO_SCHEDULE` | approved; waiting for a notice |
| `SCHEDULED` | attached to a published notice (`activeScheduleId`) |
| `COMPLETED` | the lecturer completed this subject |
| `RESOLVED` | the official result cleared this subject's E(CA) |

Scheduling, rescheduling, cancelling and completing act on **one subject link only**. Cancelling or completing subject A never changes subject B's schedule, status or reminders, even for the same student.

After approval the application status is **derived** from all its subjects (`application-status.service.js`), with a conditional write and an event (`SUBJECT_STATUS_DERIVED`) only when it changes:

- every subject `RESOLVED` → `RESOLVED`
- otherwise every non-resolved subject `COMPLETED` → `COMPLETED`
- otherwise any subject `SCHEDULED` or `COMPLETED` → `SCHEDULED`
- otherwise → `APPROVED`

So the application is `COMPLETED` only when every subject is completed. `SCHEDULED → APPROVED` exists only through this derivation, when the last scheduled subject is cancelled.

Before approval: `DRAFT` → `SUBMITTED` → `UNDER_VERIFICATION` (after physical verify) → `APPROVED` or `REJECTED`. `REJECTED`/`SUBMITTED` may be reopened to `DRAFT`.

## Physical verification

Physical signature is recorded as `AWAITING_PHYSICAL` / `PHYSICALLY_VERIFIED` / `VERIFICATION_FAILED`. The PDF is not a digital HOD signature and there is no HOD role.

`POST /api/ca/admin/scan-verify { receipt, inspectionConfirmed: true }` verifies in one step from a scanned QR value (the verify URL or its token) or a typed Application ID. It:

- requires `inspectionConfirmed: true`: the admin explicitly confirms they inspected the printed form **and** the physical HOD signature;
- is scoped to the admin's department (other departments get 404);
- records `verifiedByAdminUserId`, `physicallyVerifiedAt` and `physicalInspection { confirmedByUserId, confirmedAt, method: QR_SCAN | MANUAL_ID }`, plus a `ca.application.verify` audit record;
- is idempotent: a repeat returns `alreadyVerified: true` and writes nothing new;
- **never approves**. The status stays `UNDER_VERIFICATION` until the admin separately approves or rejects.

`POST .../applications/:id/verify` needs the same `inspectionConfirmed`. Verify, reject and reopen are now audited.

## Lecturer notification and workspace

On approval every subject link becomes `READY_TO_SCHEDULE` and the **active** lecturer(s) of each affected Subject Offering (active assignment, ACTIVE offering, same department, VERIFIED lecturer) are notified in-app and by email (`CA_LECTURER_APPROVED_STUDENT`). The idempotency key includes the application, the offering and the lecturer, so a lecturer teaching two of a student's subjects gets two notifications and a repeat creates no duplicates.

The lecturer CA workspace lists only links on that lecturer's own active offerings whose subject is `READY_TO_SCHEDULE`, `SCHEDULED` or `COMPLETED`, so only approved students appear.

## Examination notices

One `CaExamNotice` per Subject Offering (`PUBLISHED` or `CANCELLED`; a partial unique index allows one published notice per offering). A lecturer with an active assignment on that exact offering publishes date, start (and optional end) time and venue. Date and time are Asia/Colombo wall-clock time.

- `POST /api/ca/lecturer/exam-notices` publishes: it creates one `CalendarEvent` (`CA_SCHEDULE`, calendar reminders off so reminders are not duplicated), one `ACTIVE` `CaSchedule` per eligible student subject, moves those links to `SCHEDULED`, notifies those students only, and queues their reminders. Only students whose link belongs to **that** offering are included.
- `POST .../:id/reschedule` increments `generation`, supersedes the old `CaSchedule` rows (`SUPERSEDED`), creates new `ACTIVE` rows, cancels unsent older-generation messages, sends `CA_EXAM_RESCHEDULED` and regenerates reminders.
- `POST .../:id/cancel { reason }` (reason required) cancels the notice, sets `CalendarEvent.cancelledAt`, marks the schedules `CANCELLED`, returns each link to `READY_TO_SCHEDULE`, cancels its unsent messages and sends `CA_EXAM_CANCELLED`.
- `POST .../:id/attach` adds students approved since the notice was published. Students approved later also join automatically when their application is approved.
- `POST /api/ca/lecturer/subjects/:linkId/complete` completes **one subject** and cancels that subject's remaining reminders. A subject that is approved but unscheduled may still be completed, as before.

History is kept: cancelled notices stay, `history[]` records publish/reschedule/cancel with actor and reason, and superseded or cancelled `CaSchedule` rows are never deleted.

### Legacy endpoints

`POST /lecturer/schedules` is deprecated and delegates to the notice workflow (the response has `deprecated: true`); it cannot schedule without notifications and reminders. `POST /lecturer/schedules/:id/cancel` returns 409 for a schedule that belongs to a notice (cancel the notice instead) and only cancels pre-existing legacy rows, for that one subject. `POST /lecturer/applications/:id/complete` completes exactly one subject (`linkId` or `incompleteCaId`, or the lecturer's only subject in that application) and returns 400 when the choice is ambiguous.

## Notifications

Types: `CA_EXAM_SCHEDULED`, `CA_EXAM_RESCHEDULED`, `CA_EXAM_CANCELLED` (mandatory) and `CA_REMINDER`. Each is fanned out on `IN_APP`, `EMAIL` and `WHATSAPP` with a unique idempotency key. Delivery status is recorded per channel; an undelivered message is never reported as sent (see `notifications/README.md`).

`sourceId` is `noticeId:generation:linkId` and each notification stores a `guardRef`. A pre-send guard (`exam-notice.guard.js`) checks, when a message is released or sent, that the notice is still `PUBLISHED`, the generation matches, the link is still `SCHEDULED` and its active schedule is that generation. A stale message is `CANCELLED`, not sent.

Message text and WhatsApp template body variables are defined in `exam-messages.js`.

## Reminders (Asia/Colombo)

7, 3 and 1 days before the exam (exactly N×24h; Sri Lanka has no daylight saving, so the Colombo wall-clock time is the same). They are stored as `SCHEDULED` notifications with `scheduledAt` and released by the notification dispatcher sweep in the worker (every `NOTIFICATION_SWEEP_INTERVAL_MS`, default 30 s). Idempotent per student, subject, generation, offset and channel. An offset whose time has already passed when the notice is published is skipped, never sent late (recorded in the audit metadata). Rescheduling, cancelling, completing a subject or an official result for that subject cancels the unsent reminders.

## PDF / QR

Template version `ca-application-v10`. QR encodes a verification URL with an opaque token. `GET /api/ca/verify/:token` returns application ID and workflow/physical status only, with no grades.
