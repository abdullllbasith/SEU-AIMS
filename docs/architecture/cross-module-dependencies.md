# Cross-module dependencies

Allowed direction (conceptual):

```text
academic-foundation  ←  learning-environment, study-room, results, ca-recovery, notices-calendar
results              ←  gpa-cgpa, ca-recovery (E(CA) / resolution via public API or jobs)
ca-recovery          →  notifications, notices-calendar (request capabilities)
*                    →  files, authentication (identity), audit-security
```

Avoid circular internal imports. If two domains both need a fact, put it in the owning module and expose a stable function/job.

Do not move domain rules into `backend/src/shared/` to “fix” cycles.

Jobs call the same domain services as HTTP handlers. Workers are not a second copy of the business rules.
