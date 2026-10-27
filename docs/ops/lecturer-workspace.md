# Lecturer workspace (Prompt 20)

Module: `backend/src/modules/lecturer-workspace`. HTTP prefix: `/api/lecturer`. UI: `/`, `/lecturer`, `/lecturer/search`, `/lecturer/offerings/:id`.

Composes Academic Foundation assignments, Learning Environment resource counts, CA eligible/schedule lists, calendar upcoming events, and notification unread counts.

Does **not**:

- approve CA applications
- mutate official results
- store a second OfficialResource collection
- invent workload, venue, or timetable conflict policy
- open Study Room
- use a global cache key `dashboard:lecturer`

Writes stay on `/api/learning`, `/api/ca`, `/api/calendar`.
