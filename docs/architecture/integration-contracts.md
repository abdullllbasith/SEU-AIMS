# Integration contract register

Status is **verified** only when an automated test or explicit code path was checked in Prompt 13.

| Contract | Producer | Consumer | Trigger | Data reference | Sync/Async | Idempotency | Failure handling | Status |
|---|---|---|---|---|---|---|---|---|
| E(CA) detection | Results commit | CA Recovery | Official result `isEca` | `academicResultId` | Sync in commit + async `results.eca-detect` | Unique incomplete-CA per result | Commit succeeds even if later job retries | Verified |
| Result updates | Results | GPA, notifications, student experience | Import commit | `registrationNumber` + `subjectCode` | Sync GPA + async `gpa.recalculate` | Import already-COMMITTED no-op; GPA upsert | GPA job retries; result remains | Verified |
| GPA recalculation | Results / worker | GPA snapshots | Job `gpa.recalculate` | `studentUserId` | Async (also sync on commit) | Snapshot upsert | Partial failure does not un-commit results | Verified |
| CA application submit | CA Recovery | Notifications, PDF worker | Submit | `applicationId` | Sync PDF + async job | Job id includes resubmission count | Application stays SUBMITTED if channel fails | Verified (module tests) |
| CA approval/rejection/reopen | CA Recovery | Notifications | Admin decision | `applicationId` | Sync record + fanout | Notification idempotency key | Decision remains if email/WhatsApp fails | Verified (fanout wiring) |
| CA schedule | CA Recovery | Calendar, notifications, reminders | Lecturer create | `calendarEventId` | Sync calendar row + reminder jobs | Unique schedule per subject link | Calendar row rolled back if schedule insert fails | Verified (module tests) |
| Calendar sync | CA / assignments | Calendar | Source create/update/cancel | `sourceModule` + source id | Sync | Unique calendarEventId on CA schedule | Stale reminders use generation | Verified (module tests) |
| Reminder scheduling | CA / calendar | Notifications | Offsets 7/3/1 days or calendar hours | schedule/event id + offset | Async | Idempotency key includes offset | Missed job can be re-enqueued | Verified |
| Notice publication | Notices | Notifications | Publish | `notice._id` | Sync fanout | Key `NOTICE_PUBLISHED:notice:user:channel` | Notice stays published | Verified |
| Notification creation | Communication | Delivery worker | Fanout | `notificationId` | Async for EMAIL/WHATSAPP | Unique idempotency key | Provider failure is channel-local | Verified |
| Official resource publication | Learning | File scan, student listing | Upload then publish | `fileId` + offering | Scan job + HTTP | Scan short-circuits SAFE/UNSAFE | Unpublished until SAFE | Verified (module tests) |
| Profile contact changes | Student experience | Notifications (lookup at send) | Profile PATCH | `userId` | Sync user doc | n/a | Queued jobs should reload user | Partial (delivery reloads user) |
| Study Room realtime | Study Room | Socket clients | Membership | conversation id | Realtime + DB | Message ids | Reconnect loads history | Verified (module tests) |
| File scanning | Files | Study Room + Learning hooks | Upload | `fileId` | Async job + often inline scan | Terminal scan states | Fail closed (not clean) | Verified |
| PDF generation | CA Recovery | Files | Submit | `applicationId` | Sync + async | Job id with resubmission | `pdfStatus` pending/failed | Verified (module tests) |
| Audit events | All mutating modules | Audit API | After successful mutation | entity type/id | Sync | Append-only | Audit failure should be rare; not used to invent success | Verified (central `recordAudit`) |
