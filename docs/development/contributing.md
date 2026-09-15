# Contributing

1. Branch from the team’s default branch. Keep PRs small.
2. Change one module’s rules inside that module.
3. API: unversioned `/api` unless an ADR says otherwise. Default-deny stays.
4. Events: bump `createDomainEvent` `version` when payload meaning changes; consumers reload documents.
5. Security: no “temporarily disable CSRF/RBAC”. File scanner stays fail-closed.
6. Observability: request/correlation ids; no verbose bodies.
7. Database: do not casually rewrite `registrationNumber`, subject `code`, or official result identity.
8. Run `npm test` and `npm run check:docs` before review.

Git-flow is not mandated. Do not push secrets. `npm run seed` is not a data loader.
