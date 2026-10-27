# SEU-AIMS

Department-level Virtual Learning Environment / Learning Management System (VLE/LMS) for **one university department**, with a path to grow later. It is **not** a CA-only app. CA Recovery is one module inside the platform.

**Architecture:** MERN **scalable modular monolith** (one Express API, one React app, workers as extra processes of the same codebase). Not microservices.

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6 |
| API | Node.js 20, Express |
| Data | MongoDB (source of truth) |
| Cache / jobs / sockets | Redis when connected |
| Realtime | Socket.IO (Study Room) |
| Files | Storage interface (`local_dev` locally; production forbids it) |

**Roles (only these):** `STUDENT`, `LECTURER`, `DEPARTMENT_ADMINISTRATOR`. There is **no** HOD portal. The HOD’s CA role is a **physical signature**, recorded by an administrator. Study Room is **student-only**. Official results match **registration number + subject code**, never subject display name as the identity.

Backend authorization is authoritative. The UI is not a security boundary.

## Prerequisites

- Node.js **20** (see `.nvmrc`)
- npm (lockfile: `package-lock.json` — use `npm ci` in CI/production)
- MongoDB for local API (tests often use `mongodb-memory-server`)
- Redis if you want shared rate limits, the job queue between API and worker, and the Socket.IO adapter

## Setup

```bash
cd SEU-AIMS
copy .env.example .env
# fill AUTH_JWT_SECRET and local Mongo/Redis; never commit .env
npm ci
```

Also copy to `backend/.env` if you run the API from that package. Templates contain **no** real secrets.

## Commands

| Purpose | Command |
|---|---|
| API (watch) | `npm run dev:api` |
| Worker (watch) | `npm run dev:worker` |
| Frontend (Vite, proxies `/api` → `:3001`) | `npm run dev:web` |
| Tests | `npm test` |
| Production frontend build | `npm run build` |
| Bundle leak check | `npm run check:bundle` |
| Secret pattern scan | `npm run check:secrets` |
| Doc link check | `npm run check:docs` |
| Production API / worker | `npm run start:api` / `npm run start:worker` |

`npm run seed` does **not** load data. It refuses `NODE_ENV=production`.

Default local URLs: web `http://localhost:5173`, API `http://localhost:3001`. Frontend `VITE_API_BASE_URL` defaults to `/api` (same-origin via the Vite proxy).

## Documentation

Start at [docs/README.md](docs/README.md). Prompt 17 release record: [docs/qa/final-audit.md](docs/qa/final-audit.md). Architecture pack (project decisions) lives outside this repo under `Architecture/` and remains the product source of truth when it conflicts with older drafts.

## Known limitations (honest)

- **1000+ users** is a design target, **not** a measured load result.
- Object storage drivers other than `local_dev` are **not implemented**; production start forbids `local_dev`, so file put/get fail closed until an adapter is added.
- Email / WhatsApp / malware scanner are **noop** unless configured. Provider “accepted” ≠ delivered.
- No transactional outbox. Redis job lists persist jobs only if Redis itself persists.
- Socket.IO Redis adapter is **wired**, not load-tested across API instances.
- Human UAT is **not** signed off. No browser-driver E2E suite.
- GPA points/bands follow the inspected DICT-SEUSL calculator snapshot in code — **not** a senate gazette in this repository.

## Contribution

See [docs/development/contributing.md](docs/development/contributing.md). Do not add roles, give lecturers Study Room, or change result identity without an explicit project decision.
