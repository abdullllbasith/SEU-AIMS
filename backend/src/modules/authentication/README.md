# authentication

**Owns:** User identity, authentication lifecycle, and role on the identity record.

**Must not own:** Subject offerings, student progression, CA eligibility, or result ownership.

Login is **email** plus password (Argon2id). Registration number is not the login key. See `docs/security/authentication.md`.
