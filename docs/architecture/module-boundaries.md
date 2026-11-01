# Module boundaries

| Module | Owns | Must not own |
|---|---|---|
| authentication | Identity, login/session lifecycle, role on the user | Academic progression, CA eligibility, result ownership |
| academic-foundation | Department, batch, year, semester, subject, subject offering, lecturer assignment, student academic context | Official resources, results, CA workflow |
| learning-environment | Course modules, official lecturer resources, current vs historical learning access | Study Room sharing |
| study-room | Student-only chat and student resource sharing | Lecturer participation, official resources |
| study-agent | Student-only AI tutor: sessions, retrieval over authorised files, AI provider calls | Official grades/GPA/results (read-only elsewhere), chat plaintext, any write to another module |
| results | Import, parse, preview, confirm, commit, official academic records, repeat-student matching | GPA formula, CA application workflow |
| gpa-cgpa | GPA/CGPA/performance from official results | Invented grading rules; a second result store |
| ca-recovery | Incomplete CA, application, PDF/QR, physical verification states, scheduling, resolution | Email/WhatsApp provider calls; calendar model duplication |
| notices-calendar | Notices, targeted announcements, calendar events | Notification provider delivery |
| notifications | In-app/email/WhatsApp records, scheduling, retries | Deciding CA eligibility |
| student-experience | Own-profile self-service and student dashboard/history/performance composition | Official results, GPA formula, CA workflow, notice storage |
| files | Metadata, storage refs, quarantine, scan state, access abstraction | Domain authorization (“who may see this CA PDF”) |
| audit-security | Audit records, webhook verification, operational counts | Domain policy checks; editing audit history |
| admin-operations | Department-scoped operational aggregation and bounded exports | Official results, CA decisions, Study Room content, job force-success |
| lecturer-workspace | Lecturer dashboard/search composition over assigned subject offerings | Official results, CA approval, Study Room, department-wide admin KPIs |

Other modules import a module’s **public `index.js` only**, never repositories or models of another module.
