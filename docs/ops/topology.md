# Production topology

No hosting vendor is selected. The application remains a **scalable modular monolith**.

```text
Users
  → DNS
  → TLS reverse proxy / load balancer
       → static frontend (CDN or nginx)
       → API instances × N  (stateless Express)
            → MongoDB (academic source of truth)
            → Redis (rate limits + job lists + Socket.IO adapter)
            → object storage (not local_dev)
            → workers × N  (same codebase, job drain)
                 → Email adapter / WhatsApp Cloud API / malware scanner
```

## Process split

| Process | Entry | Durable state |
|---|---|---|
| API | `backend/src/server/api-server.js` | None (cookies are JWT) |
| Worker | `backend/src/workers/worker-entry.js` | None |
| Frontend | Vite `dist/` behind nginx | None |

API and worker **must** share Redis in any multi-process deployment. An in-memory queue is used only when Redis is not connected (tests / broken local setup).

Socket.IO attaches `@socket.io/redis-adapter` when Redis is connected. **Cross-instance chat fan-out has not been load-tested** in this prompt.

MongoDB should not be exposed to the internet. Redis should not be exposed to the internet. File buckets must stay private; quarantine is never a public prefix.
