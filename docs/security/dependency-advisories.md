# Dependency advisories (Prompt 12 follow-up)

This is an operational record, not a compliance claim. `npm audit fix --force` was **not** used.

## Backend — GHSA-w5hq-g745-h8pq (`uuid` via `exceljs`)

| Field | Value |
|---|---|
| Advisory | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) |
| Severity | Moderate |
| Issue | Missing buffer bounds check in uuid v3/v5/v6 when a `buf` argument is provided (`uuid` **&lt; 11.1.1**) |
| Direct package | `exceljs@4.4.0` (latest 4.x; depends on `uuid@^8.3.0`) |
| Previous tree | `uuid@8.3.2` |
| npm’s suggested fix | `exceljs@3.4.0` (major **downgrade**, rejected) |

**Action taken:** workspace `overrides.exceljs.uuid` = `11.1.1`. ExcelJS only calls `uuid.v4()` (no `buf`) in `cf-rule-ext-xform.js`. uuid 11.1.1 still provides a CommonJS `require` export that ExcelJS loads.

**Status:** advisory should be absent from backend `npm audit` after the override.

**Follow-up:** if ExcelJS publishes a 4.x/5.x that depends on patched uuid natively, remove the override. Do not jump uuid to 12+ here without re-testing CJS `require('uuid')`.

## Frontend — GHSA-82fw-gwwq-j7x9 (`vitest` / `@vitest/mocker`)

| Field | Value |
|---|---|
| Advisory | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) |
| Severity | Moderate |
| Issue | Path traversal / arbitrary file read via `@vitest/mocker` redirect mock |
| Installed | `vitest@3.2.7`, `@vitest/mocker@3.2.7` (from `vitest@^3.0.9`) |
| Vulnerable range | vitest **2.1.0 – 4.1.10** |
| Patched | `vitest@4.1.11` (4.x) or `vitest@5.0.1` (5.x) |
| Last 3.x | **3.2.7** (no patched 3.x) |
| npm’s suggested fix | `npm audit fix --force` → vitest **5.0.1** (breaking major, rejected) |

**Action taken:** none. A 3.x → 4.x/5.x bump is a breaking toolchain change (Vitest 4 peers Vite 6/7/8 and different internals). This repo’s tests do not use `vi.mock` / mocker redirects.

**Why it remains:** no compatible non-breaking upgrade exists on the Vitest 3 line.

**Exposure:** **devDependency only**. It is not shipped in `vite build` output. Risk is limited to developers/CI running Vitest with a malicious redirect mock, not the production API or student UI bundle.

**Planned remediation:** dedicated frontend test-toolchain upgrade to Vitest **≥ 4.1.11** (or 5.x if that is the chosen major), with test re-verification. **Not** Prompt 13. **Not** production go-live of this advisory as “fixed” until that upgrade lands.

## Commands that must stay unused for these findings

- `npm audit fix --force`
- Downgrading `exceljs` to 3.4.0
