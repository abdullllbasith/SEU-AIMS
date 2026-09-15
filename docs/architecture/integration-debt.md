# Integration debt

| Issue | Modules | Impact | Risk | Temporary workaround | Owner | Status |
|---|---|---|---|---|---|---|
| No transactional outbox | results, notifications, queue | Job/notification can be missing after a crash between commit and enqueue | Medium | Sync GPA/E(CA) in the commit request; jobs are retries | Platform | Open — do not fake an outbox |
| In-memory queue even if Redis is configured | infrastructure | Jobs do not survive process restart | High for multi-instance prod | Run API + worker in one process for local; production needs durable queue | Platform | Open — later prompt / ops |
| Vitest 3.x advisory | frontend tests | Dev/CI only | Low | See `docs/security/dependency-advisories.md` | Frontend toolchain | Accepted |
| WhatsApp/email are noop unless configured | notifications | Channel not delivered | Expected | In-app remains | Ops | Config |
| Integrity checks do not auto-repair | audit-security | Admin must act | Intended | `GET /api/ops/integrity` | Ops | Diagnostic |
| Socket.IO multi-instance adapter | study-room | Sticky sessions needed without Redis adapter proof | Medium | Single API instance until verified | Platform | Open |
