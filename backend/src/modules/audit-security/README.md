# audit-security

**Owns:** Audit records and security-sensitive event tracking for administration.

**Must not own:** Every domain policy check. Do not log secrets, passwords, or E2E plaintext.

**Implementation:** Prompt 12. This prompt only establishes ownership and a public module API.

Import `index.js` from other modules. Do not reach into future repositories, models, or private helpers.
