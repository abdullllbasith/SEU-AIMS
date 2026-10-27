# Deployment

Runtime is **Node.js 20** (`.nvmrc`, CI `node-version: '20'`). Images pin `node:20.18.1-bookworm-slim`, not `latest`.

Install with **`npm ci`** (lockfile). Do not deploy with `npm install` on the server.

## Commands actually used in this repo

From `SEU-AIMS/`:

```text
npm ci
npm run test:unit
npm run test:integration
npm run test:security
npm run test:frontend
npm run build
npm run check:bundle
npm run check:secrets
npm run audit:prod
```

API / worker (after filling `.env`, never committed):

```text
npm run start:api
npm run start:worker
```

`npm run seed` **refuses** `NODE_ENV=production` and does not insert data.

## Containers

Compose file: `deploy/docker-compose.yml`. Dockerfiles: `deploy/Dockerfile.api`, `Dockerfile.worker`, `Dockerfile.web`.

Prompt 15 did **not** claim a successful `docker compose up` against a live host unless that command was run in the same session.

MongoDB and Redis host ports bind to `127.0.0.1` only. API and worker are limited to 512 MB and 1 CPU in this compose file. That is a local ceiling, not a measured production capacity.

The API and worker read `../.env` when that file exists (`required: false`). From `SEU-AIMS/`:

```text
docker compose -f deploy/docker-compose.yml config
docker compose -f deploy/docker-compose.yml up --build
```

Do not commit `.env`. `stop_grace_period` is 20s so SIGTERM can finish the API and worker shutdown handlers. The API healthcheck calls `GET /api/health/live` inside the container.

## MongoDB replica set (batch progression)

Department-admin **batch progression** (`POST /api/academic/batches/:batchId/progression`) uses MongoDB multi-document transactions. The cluster **must** run as a **replica set** (MongoDB Atlas default, or `mongod --replSet` locally). A standalone instance without replica-set configuration does **not** block API startup, but progression returns errors such as *Transaction numbers are only allowed on a replica set member or mongos* until the URI points at a replica set.

Integration tests use an in-memory replica set when no transactional `MONGODB_TEST_URI` is available (`backend/tests/helpers/memory-mongo.js`).

Transient write conflicts during progression are retried up to three times in application code; audit rows are written after the transaction commits (see `backend/src/modules/academic-foundation/README.md`).

## Migrations

There is no separate migration runner. Mongoose `syncIndexes` runs when models register on process start. Do not run destructive index drops from two API instances as a custom script — none is provided.

## Rollback

1. Stop the new API/worker rollout.
2. Restore the previous image/artifact (same lockfile).
3. Do **not** automatically reverse Mongo index builds.
4. Smoke `/api/health/live`, `/api/health/ready`, login, one student results read.
5. Record the incident privately.

## TRUST_PROXY

Default `TRUST_PROXY=1` for a single reverse-proxy hop. Set `0` if the Node process is reached directly. Do not set a high hop count on an untrusted network.
