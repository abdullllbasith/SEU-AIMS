# Source-of-truth map

Verified against the current modules. Do not store a second authoritative copy of these facts.

| Domain | Owns | Must not own |
|---|---|---|
| Authentication | Credentials, sessions, account status, roles | Academic structure, results |
| Academic Foundation | Department, batch, year, semester, subject, subject offering, lecturer assignment, student academic context/history | Official grades, CA workflow |
| Learning Environment | Official resource records on a **subject offering** | Student Study Room files |
| Study Room | Student collaboration, chat metadata, shared student resources | Official resources |
| Results | Result imports, official result rows (registration number + subject code), revisions | GPA formula, CA applications |
| GPA/CGPA | Derived snapshots from official results | Official result rows |
| CA Recovery | Incomplete CA conditions, windows, applications, schedules, PDF/QR | Official grades, calendar source facts |
| Notices | Notice content and publication | Notification delivery records |
| Calendar | Calendar **representation** of events; CA/assignment sources stay in their modules | CA schedule times as the only copy |
| Notifications | Notification entities, channel delivery | Notice body, result values |
| Student Experience | Dashboard composition and profile presentation | Authoritative results/GPA |
| Admin operations | Derived department KPIs and bounded directory export | Authoritative results/GPA/CA decisions |
| Audit/Security | Audit records, health/ops, webhook verification | Domain mutations |

Current semester is **`StudentAcademicContext.currentSemesterId`** written by academic administration. Dashboards and CA do not invent a calendar-based current semester.
