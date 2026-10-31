# notifications

**Owns:** In-app inbox, channel fan-out, preferences, templates (interpolation only), delivery attempts, retries, the due-notification dispatcher, admin delivery counts.

**Must not own:** Academic facts, CA workflow, official results, Meta request construction details outside the infrastructure adapter, recipient lists from the client.

Source modules call `fanoutNotification`. Mandatory types cannot be disabled. Optional types honour email/WhatsApp preference flags through `channelsForNotification`. In-app remains on for mandatory events. Quiet hours are not applied; no rule defines which messages may be delayed.

## Statuses

`SCHEDULED` (waiting for `scheduledAt`) → `PENDING` → `SENDING` → `SENT` → `DELIVERED`, or `RETRYING` / `FAILED` / `CANCELLED`.

- `SENT` means the provider **accepted** the message. `DELIVERED` is set only by a Meta delivery receipt (webhook). Noop/unconfigured providers fail closed (`FAILED`, `not_configured`), never `SENT`.
- An in-app row is `SENT` the moment it is released. The inbox hides `SCHEDULED` and `CANCELLED` rows, so future reminders and cancelled messages never appear.

## Delivery (`delivery.service.js`)

`processNotificationDeliver` claims a notification with a single atomic `findOneAndUpdate` (status `PENDING`/`RETRYING`, due, no live lease) that sets `SENDING`, a `leaseOwner` and `leaseExpiresAt`, and increments `attemptCount`. Only one worker can win, so simultaneous workers never send the same message twice. The outcome is written only if the worker still holds the lease.

- Retryable failures (timeouts, network, 429/5xx, SMTP 4xx) go to `RETRYING` with exponential backoff in `nextAttemptAt` (1, 2, 4, 8 … min, capped at 30 min) up to `MAX_DELIVERY_ATTEMPTS` (5), then `FAILED`.
- A source module can register a pre-send guard (`registerNotificationGuard`). A message that became stale is `CANCELLED` instead of sent.
- A recipient with no address fails permanently with `no_recipient_address`.
- Delivery is **at-least-once**: if a worker dies after the provider accepted a message but before it was recorded, the lease expires and the message may be sent again.

## Dispatcher (`dispatcher.service.js`)

`releaseDueNotifications` runs in the worker every `NOTIFICATION_SWEEP_INTERVAL_MS` (default 30 s). Every move is a conditional atomic update, so several workers can sweep together:

1. `SCHEDULED` and due → `PENDING` → guard → in-app `SENT`, other channels enqueued
2. `RETRYING` and backoff elapsed → `PENDING` → enqueued
3. `SENDING` with an expired lease → `PENDING` → enqueued (or `FAILED` after the last attempt)
4. `PENDING` for over 5 minutes (lost queue job) → re-enqueued

## Providers

- **Email** (`infrastructure/providers/email-provider.js`): `EMAIL_PROVIDER=smtp` with `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM` (nodemailer). Without them the noop provider is used.
- **WhatsApp** (Meta Cloud API): business-initiated CA messages (`CA_EXAM_SCHEDULED`, `CA_EXAM_RESCHEDULED`, `CA_EXAM_CANCELLED`, `CA_REMINDER`) are sent **only as approved template messages**: `WHATSAPP_TEMPLATE_<TYPE>` and `WHATSAPP_TEMPLATE_LANGUAGE`. There is **no plain-text fallback** for them: Meta only accepts free-form text inside the 24-hour customer service window and this system does not record inbound messages, so it cannot prove a window is open. A missing template is recorded as `FAILED` / `whatsapp_template_not_configured`. Create the templates in Meta Business Manager with the body variables listed in `ca-recovery/services/exam-messages.js`. Other notification types keep their text messages.
- **Webhook** (`POST /api/webhooks/whatsapp`, signature verified): `delivered`/`read` receipts move `SENT` → `DELIVERED`; `failed` moves `SENT` → `FAILED`. Receipts only move a message forward and unknown ids are ignored.
