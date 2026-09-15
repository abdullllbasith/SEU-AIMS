# student-experience

**Owns:** Student (and own-user) profile self-service, dashboard composition, academic history presentation, and performance analytics **presentation**.

**Must not own:** Academic structure, official results, GPA formulas, CA workflow, notices, calendar events, notification delivery, official resources, or Study Room.

All `/api/me/*` routes resolve the authenticated principal. There are no student-id path parameters.

GPA values are requested from `gpa-cgpa`. Missing/zero-credit calculations are presented as unavailable, not `0.00`.
