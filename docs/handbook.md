# Developer handbook

Read in this order:

1. [Root README](../README.md) — run the app
2. [terminology.md](./terminology.md)
3. [frontend/ui-contract.md](./frontend/ui-contract.md) — academic LMS workspace (rail + cards, not a SaaS kit)
4. [architecture/modular-monolith.md](./architecture/modular-monolith.md)
5. [architecture/source-of-truth.md](./architecture/source-of-truth.md)
6. [architecture/module-boundaries.md](./architecture/module-boundaries.md)
7. [architecture/diagrams.md](./architecture/diagrams.md)
8. [modules/README.md](./modules/README.md) — then the owning module README under `backend/src/modules/<name>/README.md`
9. [api/README.md](./api/README.md)
10. [security/authentication.md](./security/authentication.md)
11. [architecture/job-graph.md](./architecture/job-graph.md)
12. [development/local-setup.md](./development/local-setup.md)
13. [ops/deployment.md](./ops/deployment.md)
14. [limitations.md](./limitations.md)

Rules that must stay visible:

- Three application roles only; no HOD login.
- Study Room = students only (API, sockets, and `/study-room` route).
- Official result identity = **registration number + subject code**.
- Dashboard **composes**; it does not own results or GPA.
- Completing a CA **does not write a grade**.
- The `/admin` dashboard **aggregates**; it does not edit official results or force jobs.
- The lecturer workspace **composes** assigned offerings, resources, CA scheduling lists, and calendar; it does not own those records or approve CA.
- Student home **composes** CA, results, GPA, learning, and calendar; it does not own those records.
- Presentation follows [frontend/ui-contract.md](./frontend/ui-contract.md). Do not invent CA1/CA2, D+, or extra grade letters.
