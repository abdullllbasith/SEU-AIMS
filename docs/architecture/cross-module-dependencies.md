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

See also:

- [source-of-truth.md](./source-of-truth.md)
- [integration-contracts.md](./integration-contracts.md)
- [job-graph.md](./job-graph.md)
- [integration-guide.md](./integration-guide.md)
- [integration-debt.md](./integration-debt.md)

