# lecturer-workspace

**Owns:** Lecturer dashboard composition, assigned-offering workspace reads, and assignment-scoped search.

**Must not own:** Academic assignments, official resources, results, GPA, CA workflow writes, calendar writes, Study Room, or department-wide admin metrics.

HTTP prefix: `/api/lecturer`. Identity comes from the session, never from `lecturerId` in the body or query.

Resource upload/publish, CA schedule create/complete, and assignment-deadline create remain on `/api/learning`, `/api/ca`, and `/api/calendar`.
