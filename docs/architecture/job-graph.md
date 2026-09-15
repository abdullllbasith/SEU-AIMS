# Background job graph

Workers call **the same domain services** as HTTP. Payloads are identifiers. Services reload documents.

```
Result import upload
  → files.malware-scan
  → results.parse
  → (admin review)
  → commit (authoritative AcademicResult)
      → syncIncompleteCaFromResult (sync)
      → gpa.recalculate (sync + job)
      → results.eca-detect (job, idempotent re-sync)
      → fanout RESULTS_UPDATED

CA application submit
  → ca-recovery.generate-pdf (sync + job)
  → fanout CA_APPLICATION_SUBMITTED

CA schedule
  → CalendarEvent (owned representation)
  → notifications.reminder (7/3/1 day offsets)
  → fanout CA_SCHEDULED / CA_REMINDER

Notice publish
  → fanout NOTICE_PUBLISHED
  → notifications.deliver (email/WhatsApp)

File upload
  → files.malware-scan
  → study-room scan state / official resource file row
```

Retry: notification delivery uses `NOTIFICATION_RETRY_MAX` (default 5). Other jobs: fail, `markFailed`, rethrow. Duplicate `jobId` is not enforced in the in-memory adapter; domain uniqueness is.

The in-memory queue is drained by `src/workers/worker-entry.js`. Redis durable transport is **not** claimed here even when `REDIS_URL` is set.
