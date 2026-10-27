# audit-security

**Owns:** Append-only audit records, department-scoped audit queries, operational metrics snapshots, webhook signature verification, health live/ready composition.

**Must not own:** Domain authorization decisions, plaintext chat, passwords, or a generic "edit audit log" feature.

Audit retention duration is **not configured** until the institution sets `AUDIT_RETENTION_DAYS`. The system does not auto-delete audit rows.

Batch progression (`academic.batch.progress`) records audit events **after** the progression transaction commits. There is no transactional audit pipeline today; if the audit insert fails, progression still stands and the API logs `Batch progression succeeded but audit write failed` for operators.

Administrators see counts and action metadata, not private academic payloads or IP addresses (IP is stored hashed, never returned).
