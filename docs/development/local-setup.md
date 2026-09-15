# Local setup

1. Node 20, MongoDB 7-ish for a real API, Redis 7 if you run API **and** worker as two processes.
2. Copy `.env.example` → `.env` (and `backend/.env` if needed). Set a long `AUTH_JWT_SECRET`.
3. `npm ci`
4. Three terminals: `npm run dev:api`, `npm run dev:worker`, `npm run dev:web`
5. Open `http://localhost:5173`

Without Redis, each process has its own memory queue: the worker will **not** see API jobs. Production forbids missing Redis.

Tests: `npm test` (backend uses in-memory Mongo; frontend Vitest/jsdom).

There is no production seed. Synthetic users live in `backend/tests/helpers/qa-fixtures.js` for automated tests only.
