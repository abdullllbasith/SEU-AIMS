# Module handbook

Each domain has a README next to the code. Import only `backend/src/modules/<name>/index.js`.

| Module | Code README | UI (presentation) |
|---|---|---|
| authentication | [authentication/README.md](../../backend/src/modules/authentication/README.md) | `frontend/src/modules/auth` |
| academic-foundation | [academic-foundation/README.md](../../backend/src/modules/academic-foundation/README.md) | `frontend/src/modules/academic`, admin academic |
| learning-environment | [learning-environment/README.md](../../backend/src/modules/learning-environment/README.md) | `frontend/src/modules/learning` |
| study-room | [study-room/README.md](../../backend/src/modules/study-room/README.md) | `frontend/src/modules/study-room` |
| study-agent | [study-agent/README.md](../../backend/src/modules/study-agent/README.md) | `frontend/src/modules/study-agent` |
| results | [results/README.md](../../backend/src/modules/results/README.md) | student + admin results |
| gpa-cgpa | [gpa-cgpa/README.md](../../backend/src/modules/gpa-cgpa/README.md) | performance page composes API |
| ca-recovery | [ca-recovery/README.md](../../backend/src/modules/ca-recovery/README.md) | student/lecturer/admin CA |
| notices-calendar | [notices-calendar/README.md](../../backend/src/modules/notices-calendar/README.md) | notices, calendar |
| notifications | [notifications/README.md](../../backend/src/modules/notifications/README.md) | inbox |
| student-experience | [student-experience/README.md](../../backend/src/modules/student-experience/README.md) | dashboard, profile, history |
| files | [files/README.md](../../backend/src/modules/files/README.md) | no standalone UI |
| audit-security | [audit-security/README.md](../../backend/src/modules/audit-security/README.md) | admin ops |
| admin-operations | [admin-operations/README.md](../../backend/src/modules/admin-operations/README.md) | `/admin` dashboard |
| lecturer-workspace | [lecturer-workspace/README.md](../../backend/src/modules/lecturer-workspace/README.md) | `/lecturer` workspace |

Frontend must not re-implement GPA or authorization.

Current vs historical learning: offerings the student can see come from **current** `StudentAcademicContext` plus **history** rows — dashboards do not invent “this calendar month is semester 1”.
