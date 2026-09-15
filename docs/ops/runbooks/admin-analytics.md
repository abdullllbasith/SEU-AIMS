# Admin analytics runbooks

Use with [admin-operations.md](../admin-operations.md). Do not paste student result tables into public tickets.

## Pending result import

- **Symptoms:** dashboard `pendingResultImports` > 0; `/admin/results` shows READY_FOR_REVIEW or earlier.
- **Checks:** import monitor on `GET /api/admin/result-imports/:id`; worker for `results.parse`; file scan status on the owning import file.
- **Safe actions:** complete preview/confirm/commit on `/api/results`. Do not PATCH official rows from `/api/admin`.
- **Evidence:** import id, processingStatus, summary counts, audit slice.
- **Escalate:** if PARSE_FAILED after a supported template, parser owner.

## Failed CA PDF

- **Symptoms:** CA overview `failedApplicationPdfs` > 0; student cannot download PDF.
- **Checks:** application `pdfStatus`; worker `ca-recovery.generate-pdf`; storage driver.
- **Safe actions:** re-submit/generate through CA APIs. Do not mark PDF READY in Mongo.
- **Evidence:** applicationId, pdfStatus.
- **Escalate:** storage/worker owner.

## CA application verification

- **Symptoms:** pending CA applications on the dashboard.
- **Checks:** `/admin/ca` and physical verification status. HOD signature is physical; there is no HOD portal.
- **Safe actions:** verify/approve/reject/reopen on `/api/ca/admin` only.
- **Evidence:** applicationId, workflowStatus, physicalVerificationStatus.
- **Escalate:** department process owner (not a software override).

## Failed notification

- **Symptoms:** `failedNotifications` > 0; `/api/admin/notifications/health` recentFailures.
- **Checks:** channel, failureCode; email/WhatsApp adapter configuration. In-app may still be SENT.
- **Safe actions:** keep academic writes; retry by repeating the domain event that fans out. Do not invent provider “delivered”.
- **Evidence:** type, channel, failureCode (no message body in tickets).
- **Escalate:** provider + ops.

## Worker backlog

- **Symptoms:** `/api/admin/jobs` or `/api/ops/queues` depth rising.
- **Checks:** worker process; Redis; job names in logs.
- **Safe actions:** start workers; do not delete Redis lists; do not POST `/api/admin/jobs/execute`.
- **Evidence:** adapter, depth, failed count.
- **Escalate:** platform owner.

## Scanner outage

- **Symptoms:** official resources stay unpublished/un-downloadable; scan jobs queued.
- **Checks:** `MALWARE_SCANNER_*`; `files.malware-scan`.
- **Safe actions:** leave files unavailable. Do not mark SAFE.
- **Evidence:** scanStatus on StoredFile (via owning domain UI).
- **Escalate:** security operator.

## Calendar sync failure

- **Symptoms:** operators expect an external calendar.
- **Checks:** this product stores `CalendarEvent` in Mongo only. There is no provider sync job.
- **Safe actions:** create/cancel events on `/api/calendar/admin`. Do not claim Outlook/Google sync.
- **Evidence:** upcomingPublishedEvents on `/api/admin/calendar/health`.
- **Escalate:** product owner if an external calendar is required (unconfirmed).

## Security alert

- **Symptoms:** denied audit events rising; `/api/admin/security`.
- **Checks:** action, actorRole, reason. IP is hashed and not returned.
- **Safe actions:** disable the account through authentication/account-status flows if policy allows. Do not delete audit rows.
- **Evidence:** denied count, action names.
- **Escalate:** security operator.

## Storage growth

- **Symptoms:** disk on the API host or object store.
- **Checks:** host disk; `FILE_STORAGE_DRIVER`. Admin storage health **does not** return department file totals (no `departmentId` on StoredFile).
- **Safe actions:** do not purge files from the dashboard. Follow backup/restore docs.
- **Evidence:** host metrics, not this KPI card.
- **Escalate:** platform owner.

## Data-quality issue

- **Symptoms:** `/api/admin/data-quality` or `/api/ops/integrity` issueCount > 0.
- **Checks:** issue codes (`eca_missing_result`, `offering_missing_subject`, …).
- **Safe actions:** Detect → review → repair through the owning module → re-run check → keep the audit trail. No auto-repair of official results.
- **Evidence:** issue code + entityId.
- **Escalate:** module owner for that entity.
