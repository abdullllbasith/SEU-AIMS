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
