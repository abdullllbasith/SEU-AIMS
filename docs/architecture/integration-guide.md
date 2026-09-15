# Integration guide

## Where things live

- Domain modules: `backend/src/modules/*` — import each module from its `index.js`.
- Shared HTTP/auth helpers: `backend/src/shared`.
- Queue/workers: `backend/src/infrastructure/queue`, `backend/src/workers`.
- Frontend routes: `frontend/src/routes/index.jsx`.

## Run locally

Copy `.env.example` (no real secrets). Then:

```bash
npm run dev:api
npm run dev:worker
npm run dev:web
```

## Tests

```bash
npm test
npm run build
```

## Jobs

`registerJobProcessors` maps job names to domain services. `processQueuedJobs` drains the in-memory queue (tests and the worker loop).

Do not put academic rules in the worker.

## Scope

HTTP principal → domain service → Mongo documents. Jobs carry `studentUserId` / `importId` / `fileId` and **reload**. `correlationId` is copied onto job payloads and restored while a processor runs.

## Providers

WhatsApp HTTP calls use `PROVIDER_TIMEOUT_MS` (default 10000). Unconfigured providers fail that channel only.

## Integrity

Department administrators: `GET /api/ops/integrity`. Read-only.
