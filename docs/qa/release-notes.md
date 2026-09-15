# Release notes — QA / release-readiness increment (Prompt 14)

## Features
No new academic features. This increment adds QA fixtures, CI, smoke/security/concurrency tests, and release documentation.

## Fixes
None claimed beyond test/CI coverage of existing behavior.

## Known limitations
- Jobs are in-memory (not durable Redis transport).
- No measured 1,000-user load test.
- WhatsApp/email production delivery unverified (adapters/noop).
- Human UAT not signed off.
- Vitest 3.x moderate advisory remains (devDependency).
- No browser-driver E2E suite.

## Configuration
Unchanged from Prompt 12/13. `PROVIDER_TIMEOUT_MS` optional. Production still requires JWT, explicit CORS, Mongo, Redis (rate limits), non-`local_dev` storage.

## Migrations
None. Indexes are created by application `syncIndexes` in tests / startup registerModels.

## Testing performed (2026-09-15, this machine)
- Backend `npm test`: **171 pass / 0 fail / 0 skip** (~210 s)
- Frontend `vitest run`: **9 pass / 0 fail** in 7 files (~9 s)
- Combined automated: **180 pass**
- Coverage: **not measured** (`test:coverage` not run)
- Human UAT: **not executed**
