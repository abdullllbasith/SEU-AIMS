# Security handbook

Index of security docs that match the code.

| Topic | Doc |
|---|---|
| Auth / sessions / CSRF | [authentication.md](./authentication.md) |
| Trust / files / Study Room | [boundaries.md](./boundaries.md), [trust-boundaries.md](./trust-boundaries.md) |
| Threats | [threat-model.md](./threat-model.md) |
| Production gate | [production-checklist.md](./production-checklist.md) |
| Backups (not demonstrated) | [backup-recovery.md](./backup-recovery.md) |
| Logs / metrics | [observability.md](./observability.md) |
| Dependency advisories | [dependency-advisories.md](./dependency-advisories.md) |
| Secrets rotation | [../ops/secrets.md](../ops/secrets.md) |

File pipeline: upload → quarantine → scan → available or rejected. Unconfigured scanner ≠ clean. Domain modules decide **who** may download.

Audit is append-only. Chat plaintext is not audited (ciphertext only).
