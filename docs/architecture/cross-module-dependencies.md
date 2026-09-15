# Cross-module dependencies

Allowed direction (conceptual):

```text
academic-foundation  ←  learning-environment, study-room, results, ca-recovery, notices-calendar, student-experience
results              ←  gpa-cgpa, ca-recovery (E(CA) / resolution via public API or jobs), student-experience (read)
ca-recovery          →  notifications, notices-calendar (request capabilities)
student-experience   →  academic-foundation, results, gpa-cgpa, notices-calendar, notifications, ca-recovery, learning-environment, files, authentication, audit-security
*                    →  files, authentication (identity), audit-security
```

Avoid circular internal imports. If two domains both need a fact, put it in the owning module and expose a stable function/job.

Do not move domain rules into `backend/src/shared/` to “fix” cycles.

Jobs call the same domain services as HTTP handlers. Workers are not a second copy of the business rules.
