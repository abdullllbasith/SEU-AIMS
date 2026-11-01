# Known limitations

These are current facts, not a promise they will be fixed in this prompt.

| Topic | Fact |
|---|---|
| Scale | No 1000+ user measurement in this repo |
| Object storage | Only `local_dev` writes files; other `FILE_STORAGE_DRIVER` values fail closed |
| Queue | Redis lists when Redis is connected; lost if Redis is wiped; no outbox |
| Socket.IO | Redis adapter attached when Redis connects; multi-instance **not** load-tested |
| Providers | Email/WhatsApp/scanner/AI noop unless configured |
| Study Agent retrieval | Keyword (Mongo `$text`) search over PDF/plain-text chunks only; no embeddings; scanned PDFs without a text layer and DOCX/PPTX are not indexed |
| Study Agent indexing | Needs the worker process (like malware scans); with only the in-memory queue, indexing does not run |
| Study Agent uploads | A student attachment is unusable until a malware scan marks it clean, which needs the worker and a configured scanner (noop leaves it blocked). Removed uploads become unavailable but the stored object is not deleted (no delete in the storage interface) |
| Study Agent web research | Uses the provider's search grounding; citations are shown as returned, only `https` links are kept, and source quality is not independently verified |
| Study Agent AI | Answers are AI-generated and can be wrong; live behaviour against the real Gemini API has not been exercised in this repo (tests use a mock) |
| Parsers | Synthetic PDF/XLSX only; unknown layouts fail closed |
| E2E chat | Not Signal; no group-key rotation; TOFU public keys |
| UAT | Scripts exist; humans have not signed off here |
| E2E browser | No Playwright/Cypress suite |
| GPA | DICT calculator snapshot in code; **unconfirmed** as faculty senate policy |
| Login id | Email is the implemented login identifier; **unconfirmed** if the institution requires registration-number login |
| Retention | `AUDIT_RETENTION_DAYS=0` means no auto-delete; legal retention **unconfirmed** |
| Backups | Documented, restore not demonstrated |
| Hosted deploy | Compose file validates; `docker compose up` and a public TLS deploy were not run on 2026-10-20 |
| Dependencies | Production `npm audit --omit=dev` was clean on 2026-10-20 after `proxy-addr` 2.0.8. Dev-only Vitest/`tinypool` advisories remain; they are not in the production install |
| Admin analytics | Derived counts only; export capped at 500; queue/file totals not department-split |
