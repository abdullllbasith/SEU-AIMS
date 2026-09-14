# API route ownership

Prefixes are reserved. Endpoints are added by later prompts. Do not document unimplemented behavior as complete.

| Prefix | Owner |
|---|---|
| `/api/health` | application composition |
| `/api/auth` | authentication |
| `/api/academic` | academic-foundation |
| `/api/learning` | learning-environment |
| `/api/study-room` | study-room |
| `/api/results` | results |
| `/api/gpa` | gpa-cgpa |
| `/api/ca` | ca-recovery |
| `/api/notices` | notices-calendar |
| `/api/calendar` | notices-calendar |
| `/api/notifications` | notifications |
| `/api/files` | files |
| `/api/audit` | audit-security |

No API version prefix unless a later decision requires one.

## Academic foundation (Prompt 05)

Department administrators manage structure under `/api/academic`. Students use `GET /api/academic/me/context` and `GET /api/academic/me/offerings`. Lecturers use `GET /api/academic/me/offerings` and may read an offering only when actively assigned. Mutating routes require CSRF. Records are archived rather than deleted.
