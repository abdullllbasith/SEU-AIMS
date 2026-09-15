# Developer handbook

Read in this order:

1. [Root README](../README.md) — run the app
2. [terminology.md](./terminology.md)
3. [architecture/modular-monolith.md](./architecture/modular-monolith.md)
4. [architecture/source-of-truth.md](./architecture/source-of-truth.md)
5. [architecture/module-boundaries.md](./architecture/module-boundaries.md)
6. [architecture/diagrams.md](./architecture/diagrams.md)
7. [modules/README.md](./modules/README.md) — then the owning module README under `backend/src/modules/<name>/README.md`
8. [api/README.md](./api/README.md)
9. [security/authentication.md](./security/authentication.md)
10. [architecture/job-graph.md](./architecture/job-graph.md)
11. [development/local-setup.md](./development/local-setup.md)
12. [ops/deployment.md](./ops/deployment.md)
13. [limitations.md](./limitations.md)

Rules that must stay visible:

- Three application roles only; no HOD login.
- Study Room = students only (API, sockets, and `/study-room` route).
- Official result identity = **registration number + subject code**.
- Dashboard **composes**; it does not own results or GPA.
- Completing a CA **does not write a grade**.
- The `/admin` dashboard **aggregates**; it does not edit official results or force jobs.
- The lecturer workspace **composes** assigned offerings, resources, CA scheduling lists, and calendar; it does not own those records or approve CA.
- Student home **composes** CA, results, GPA, learning, and calendar; it does not own those records.
- Do not invent CA1/CA2, D+, or extra grade letters.
