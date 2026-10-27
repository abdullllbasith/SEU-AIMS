# Student workspace experience map (Prompt 19)

Composition only. Each row is a student question, not a new source of truth.

| Student question | Home surface | Authoritative source | Must not do |
|---|---|---|---|
| Where am I this semester? | Dashboard academic context | `StudentAcademicContext` | Infer semester from the calendar |
| What needs action? | Attention list | CA, notices, notifications, calendar, published resources | Invent urgency or risk scores |
| What should I study? | Current subjects + official resources | academic-foundation + learning-environment | Mix in Study Room files |
| What is coming next? | Deadline groups / `/api/me/upcoming` | Calendar events as stored | Fake reminders |
| Did results change? | Attention + results pages | AcademicResult + notifications | Edit grades here |
| What is my performance? | GPA block + `/performance` | gpa-cgpa snapshots | Recalculate GPA in React |
| Do I have a CA issue? | CA widget + `/ca` | IncompleteCa + applications + window lifecycle | Digital HOD approval |
| Who can I talk to? | Study Room entry | study-room (students only) | Lecturer chat |

Search (`GET /api/me/search`) is prefix match over the student's authorized offerings and **published, scanned-safe official resources**.
