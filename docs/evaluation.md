# Evaluation guide

For supervisors who need to see the system without reconstructing it from chat logs.

## What this project is

A department VLE/LMS (structure, official resources, student Study Room, results, GPA snapshots, CA Recovery, notices/calendar/notifications, profile/dashboard, audit). Initial scope: one department.

## What to open

| Question | Where |
|---|---|
| How do I run it? | [../README.md](../README.md) |
| What is in scope? | This file + [limitations.md](./limitations.md) |
| Who owns data? | [architecture/source-of-truth.md](./architecture/source-of-truth.md) |
| Demo story | [qa/demonstration-scenario.md](./qa/demonstration-scenario.md) |
| Tests | [testing/README.md](./testing/README.md) |
| Security stance | [security/threat-model.md](./security/threat-model.md) |

## Claims you should **not** hear

- 1000+ concurrent users proven
- WhatsApp/email guaranteed delivery
- Disaster recovery tested
- HOD digital approval
- Lecturers in Study Room
- Name-based result matching

## How to verify quickly

```bash
npm ci
npm test
npm run build
```

Automated tests use **synthetic** registrations (for example `SEU/IS/21/ICT/A01`). They are not real students.
