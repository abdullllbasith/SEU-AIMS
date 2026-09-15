# Integration debt

| Issue | Modules | Impact | Risk | Temporary workaround | Owner | Status |
|---|---|---|---|---|---|---|
| No transactional outbox | results, notifications, queue | Job/notification can be missing after a crash between commit and enqueue | Medium | Sync GPA/E(CA) in the commit request; jobs are retries | Platform | Open — do not fake an outbox |
| Redis job lists when Redis is connected | infrastructure | Jobs survive API restart if Redis persists | Low when Redis AOF/replica is on | Keep worker + Redis up; still no outbox | Platform | Implemented Prompt 15 — not load-tested |
| Socket.IO Redis adapter when Redis is connected | study-room | Cross-instance events unverified in staging | Medium | Single API until verified in target env | Platform | Wired, not load-tested |
| Vitest 3.x advisory | frontend tests | Dev/CI only | Low | See `docs/security/dependency-advisories.md` | Frontend toolchain | Accepted |
| WhatsApp/email are noop unless configured | notifications | Channel not delivered | Expected | In-app remains | Ops | Config |
| Integrity checks do not auto-repair | audit-security | Admin must act | Intended | `GET /api/ops/integrity` | Ops | Diagnostic |
