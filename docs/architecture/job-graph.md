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

Study Agent attachment
  upload (StoredFile STUDY_AGENT_UPLOAD, SCANNING + UNAVAILABLE)
  → files.malware-scan
  → syncUploadAfterScan (SAFE → AVAILABLE to its owner)
  → study-agent.index-document (PDFs only; images go to the model inline)

Study Agent document indexing
  files.malware-scan (SAFE official / shared learning file)
  → study-agent.index-document (extract text, chunk, store; idempotent by checksum)
  (also queued lazily when a student opens a subject session and a visible file has no index)

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

The in-memory queue is used when Redis is not connected. With Redis connected, API and worker share Redis lists (`seu-aims:queue:{high,normal,low}`). Failed jobs are capped at 1000 entries. Duplicate `jobId` is still enforced in domain uniqueness, not as a Redis lock.
