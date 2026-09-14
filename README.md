# SEU-AIMS

Department-level Virtual Learning Environment / Learning Management System.

This repository is a **scalable modular monolith**:

- React frontend
- Node.js + Express API
- MongoDB, Redis, job queue, object/file storage
- Independently started background workers

Application source of truth for architecture lives in the project Architecture pack. This repository implements that architecture.

Do not treat the frontend as the security boundary. Backend authorization is authoritative.

## Layout

- `frontend/` — React UI (presentation only)
- `backend/` — Express modular monolith, workers, infrastructure
- `docs/` — repository-level architecture notes (not a substitute for code)

## Development

Copy `.env.example` to `backend/.env` (and optionally root `.env`) and fill local values. Never commit secrets.

```bash
npm install
npm run dev:api
npm run dev:worker
npm run dev:web
```

```bash
npm test
```

Feature modules are scaffolded with ownership boundaries. Domain behavior is implemented in later foundation and core-module prompts.
