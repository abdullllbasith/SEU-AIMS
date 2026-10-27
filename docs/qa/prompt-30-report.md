# Prompt 30 — deployment and operations report

**Date:** 2026-10-20  
**What was executed:** `docker compose -f deploy/docker-compose.yml config` (syntax only) and the production-config unit tests in `observability-webhooks.test.js` (7 passed, 0 failed).  
**What was not executed:** `docker compose up`, a hosted deploy, TLS on a public host, backup restore, rollback of a live release, or a 1,000-user load.

## Decision

**NOT PRODUCTION READY**

The repository has a versioned staging-shaped stack, CI gates, health routes, and runbooks. Those are not evidence that a production environment is up, monitored, backed up, or restorable.

## Status

| Area | Status |
|---|---|
| Frontend | PARTIAL — `deploy/Dockerfile.web` and nginx static proxy exist; no hosted delivery was observed |
| API | PARTIAL — image, SIGTERM shutdown, live/ready routes, and a compose healthcheck exist; no multi-instance deploy was observed |
| Load balancer | PARTIAL — local nginx on port 8080 is HTTP only |
| WebSockets | PARTIAL — nginx proxies `/socket.io/` with upgrade headers; multi-instance fanout was not load-tested |
| MongoDB | PARTIAL — compose service exists; host port is `127.0.0.1` only; replica set is required for progression and is not started by this compose file |
| Redis | PARTIAL — compose service with AOF; host port is `127.0.0.1` only; production start still requires `REDIS_URL` |
| Object storage | FAIL for production — `local_dev` is rejected by the production config gate; no private bucket was configured or tested here |
| Workers | PARTIAL — separate image and SIGTERM drain; not scaled or observed |
| Queues | PARTIAL — Redis lists when connected; in-memory fallback is not safe for more than one API |
| Scanner | PARTIAL — fail-closed when unconfigured; no live scanner |
| Email | PARTIAL — noop unless configured; outage does not roll back academic writes |
| WhatsApp | PARTIAL — unsigned webhooks rejected in tests; no live Meta app |
| CI/CD | PARTIAL — `.github/workflows/qa.yml` runs secrets, docs, tests, build, bundle check, and production audit; this session did not re-run that workflow |
| Monitoring | PARTIAL — `/api/health/live`, `/api/health/ready`, `/api/ops/metrics`; no external alerting |
| Alerting | FAIL — no paging or ticket integration is configured |
| Backups | FAIL — documented only |
| Restore | FAIL — not demonstrated |
| Rollback | PARTIAL — procedure is written; a live rollback was not performed |
| Load validation | FAIL — not run |
| Runbooks | PASS as documents — API, worker backlog, Mongo, Redis, scanner, email, WhatsApp, certificates, failed deploy, storage, malware, notifications, security incident, and restore. Restore and storage recovery are marked not demonstrated |
| Security | PARTIAL — production gate now requires `https://` on `API_PUBLIC_URL`; cookies Secure; CORS explicit; secrets stay out of git |

## Changes in this pass

- Compose publishes MongoDB and Redis on `127.0.0.1` only.
- API and worker compose services cap memory at 512 MB and CPU at 1. These are local ceilings, not measured capacity.
- API healthcheck calls `GET /api/health/live`. `stop_grace_period` is 20s.
- API and worker load `../.env` only when that file exists.
- `docker compose config` succeeded. Containers were not started.
- Production config rejects an `http://` `API_PUBLIC_URL`.
- Runbooks cover storage outage, malware, notification provider failure, and a security incident without deleting audit rows.

## Audit answers

1. A single API instance failing over to another was **not** deployed. Compose runs one API.
2. The worker is a separate process and can be started without the API. Independent scale-out was **not** measured.
3. Readiness reports Mongo as down when the database check fails. A live outage was **not** induced.
4. Official academic rows are in MongoDB. Redis holds queues, rate limits, and the socket adapter. A Redis wipe loses jobs; it does not delete results. That recovery was **not** staged.
5. Production config rejects `local_dev`. A real storage failure returning false success was **not** staged. Reconciliation reports a missing object.
6. An unconfigured scanner does not mark files clean (existing test). 
7. Rollback steps are documented. They were **not** executed against a running release.
8. There is no migration runner. Index sync runs on startup. A previous release against a new schema was **not** tested.
9. Backups are **not** shown to be restorable.
10. Websocket reconnect after deploy was **not** tested.
11. Duplicate reminder jobs are idempotent in the communication tests from Prompt 29. A restart duplicate was not re-run in this pass.
12. Email and WhatsApp failures do not write results or CA decisions. Provider outage was not induced on a live account.
13. Protected files are not served from a public bucket in this repo because production storage is not configured.
14. The frontend bundle check exists in CI. It was not re-run in this pass. Server secrets are not part of the Vite source.
15. Study Room tests from Prompt 29 showed stored ciphertext does not contain the plaintext. This pass did not re-log a message.
16. Queue depth is on `/api/ops/queues` and the worker runbook. No alert fires by itself.
17. Runbooks exist. A full outage drill was **not** done.
18. 1,000-user load was **not** run.
19. CI is the review gate in git. This session did not confirm branch protection on the host.
20. No uptime, RTO, or capacity number is claimed.

## Accepted risks

- No hosted production or staging environment was observed.
- No backup restore, live rollback, external alerting, or load test.
- Compose MongoDB is a single node, not a replica set, so batch progression transactions will fail until the URI points at a replica set.
- 512 MB / 1 CPU limits are operator choices for this compose file, not a capacity study.
