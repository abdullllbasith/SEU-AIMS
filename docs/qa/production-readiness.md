# Production readiness (Prompt 14)

Items are checked only when evidenced in-repo. Target-environment deployment was **not** performed in this session.

## Application
- [x] Frontend production build (2026-09-15: `vite v6.4.3`, 113 modules, `dist/assets/index-CtQap-pM.js` 393.54 kB / 117.14 kB gzip)
- [ ] Backend production start on real hosting (not run here)
- [x] Bundle leak check passed (3 files; no secret-pattern hits)
- [x] Test credentials not used as production defaults

## Database
- [x] Indexes defined on models
- [x] Backup/restore assumptions documented (`docs/security/backup-recovery.md`)
- [ ] Restore actually demonstrated

## Security
- [x] Auth/RBAC/IDOR automated tests
- [x] File scanner fail-closed tests
- [x] Study Room student-only tests
- [x] Webhook HMAC tests
- [x] `npm audit --omit=dev` — **0 vulnerabilities** (2026-09-15). Full `npm audit` (including dev): 2 moderate Vitest/`@vitest/mocker` advisories; `--force` not used

## Operations
- [x] Health live/ready
- [x] Logs redaction unit tests
- [x] Audit + ops integrity
- [ ] Queue durability

## QA
- [x] Unit / integration / security / frontend
- [x] API smoke
- [ ] Human UAT
- [ ] Performance at department scale
