# 0001 — Repository structure for the modular monolith

## Status

Accepted for Prompt 02 (project structure).

## Decision

Use a two-package workspace (`frontend`, `backend`) without splitting domains into microservices.

Backend layout:

- `app/` — Express composition, middleware
- `config/` — environment-backed configuration
- `infrastructure/` — MongoDB, Redis, queue, storage, providers, realtime, logging
- `modules/` — eleven logical domains with public `index.js` APIs
- `shared/` — technical helpers only
- `workers/` — separate process entry for queued jobs

Frontend layout mirrors domain ownership for discoverability. Pages and workflows are not implemented in this prompt.

## Consequences

Later prompts add behavior inside these boundaries instead of inventing a parallel tree.

Local disk storage is a development driver only, behind `FILE_STORAGE_DRIVER`.
