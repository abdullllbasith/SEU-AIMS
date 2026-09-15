# Known limitations

These are current facts, not a promise they will be fixed in this prompt.

| Topic | Fact |
|---|---|
| Scale | No 1000+ user measurement in this repo |
| Object storage | Only `local_dev` writes files; other `FILE_STORAGE_DRIVER` values fail closed |
| Queue | Redis lists when Redis is connected; lost if Redis is wiped; no outbox |
| Socket.IO | Redis adapter attached when Redis connects; multi-instance **not** load-tested |
| Providers | Email/WhatsApp/scanner noop unless configured |
| Parsers | Synthetic PDF/XLSX only; unknown layouts fail closed |
| E2E chat | Not Signal; no group-key rotation; TOFU public keys |
| UAT | Scripts exist; humans have not signed off here |
| E2E browser | No Playwright/Cypress suite |
| GPA | DICT calculator snapshot in code; **unconfirmed** as faculty senate policy |
| Login id | Email is the implemented login identifier; **unconfirmed** if the institution requires registration-number login |
| Retention | `AUDIT_RETENTION_DAYS=0` means no auto-delete; legal retention **unconfirmed** |
| Backups | Documented, restore not demonstrated |
| Vitest 3.x | Moderate advisory, test-only |
