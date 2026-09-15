# Risk register

| Risk | Likelihood | Impact | Mitigation | Owner | Release effect |
|---|---|---|---|---|---|
| In-memory job queue despite REDIS_URL | High in multi-instance prod | Lost jobs / duplicate work | Single instance or attach durable queue before scale-out | Platform | Limitation |
| No transactional outbox | Medium | Missed notification after crash | Sync GPA/E(CA) on commit; jobs are retries | Platform | Limitation |
| Vitest 3.x advisory | Low | Dev/CI file-read via mocker | Upgrade Vitest later; not in production bundle | Frontend | Accepted residual |
| Unmeasured 1000+ load | Certain (not measured) | Unknown saturation | Do not claim capacity; measure in staging | Ops | Limitation |
| WhatsApp/email noop | Default | No channel delivery | Configure providers; in-app remains | Ops | Expected until configured |
| Human UAT not executed | Certain here | UX/process gaps | Run `uat-scenarios.md` with department users | Product | Limitation |
| Socket.IO multi-instance | Medium | Missed realtime events | Sticky sessions / adapter verification | Platform | Limitation |
