# Authentication

## Mechanism

- Login identifier: **email** (technical default until the owner finalizes another identifier).
- Academic identity: **registration number** on `StudentAcademicContext`, not used as the password login key.
- Passwords: Argon2id. Never returned in APIs or logs.
- Access token: short-lived JWT in HttpOnly cookie `seu_access` (claims: `sub`, `role`, `authVersion`, `sid`).
- Refresh token: opaque rotating token, stored hashed, HttpOnly cookie `seu_refresh`. Reuse of a rotated token revokes the family.
- CSRF: readable `seu_csrf` cookie plus `X-CSRF-Token` header on mutating requests.
- Revocation: `authVersion` bump and session `revokedAt` on password change, reset, suspend, role-sensitive account status change.

## Public API allowlist

`GET /api/health`, `GET /api/auth/csrf`, `POST /api/auth/login|logout|refresh|forgot-password|reset-password`.

All other `/api` routes require authentication (default deny).

## Roles

`STUDENT`, `LECTURER`, `DEPARTMENT_ADMINISTRATOR` only. Study Room requires `STUDENT`. Lecturer subject actions require an active `LecturerAssignment`.
