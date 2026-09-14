# Security boundaries

- Backend RBAC and object-level checks are authoritative. Hidden UI is not security.
- Roles: Student, Lecturer, Department Administrator only. No HOD application role.
- Study Room is student-only (enforced later in the Study Room module, not only in the UI).
- Configuration and secrets come from environment variables. Frontend must not contain server secrets.
- Uploaded files are untrusted until validation, quarantine, and malware scan complete.
- Persistent files use the storage interface (object storage in production).
- Do not log passwords, tokens, private keys, or E2E chat plaintext.
- E2E Study Room cryptography will live in a dedicated client crypto layer and Study Room message handling — not scattered in pages or repositories.
