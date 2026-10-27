# student-experience

**Owns:** Student (and own-user) profile self-service, dashboard composition, academic history presentation, and performance analytics **presentation**.

**Must not own:** Academic structure, official results, GPA formulas, CA workflow, notices, calendar events, notification delivery, official resources, or Study Room.

Dashboard and `/api/me/search` **compose** those domains. Attention items are derived from loaded records, not a second workflow engine.

GPA values are requested from `gpa-cgpa`. Missing/zero-credit calculations are presented as unavailable, not `0.00`.
