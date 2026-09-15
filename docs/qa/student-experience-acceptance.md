# Student experience acceptance (Prompt 19)

API-level checks in `backend/tests/integration/student-experience.test.js`. Browser UAT is **not** marked passed.

| Scenario | Expected UX | Backend source | Test | Status |
|---|---|---|---|---|
| Current semester | Registration and current offerings | Academic Foundation | Dashboard integration | Automated |
| E(CA) | Persistent CA attention + widget | Results + CA | Dashboard attention `CA_CONDITION` | Automated |
| Result update | History/GPA after official row change | Results + GPA | Existing GPA/history test | Automated |
| New resource | Listed only when published + SAFE | Learning Environment | Composition uses `isStudentVisibleResource` | Automated (visibility rule) |
| CA schedule | Widget + calendar when scheduled | CA + Calendar | caSummary upcomingSchedule | Unit/integration existing paths |
| Notice | Targeted notice on dashboard | Notices | Dashboard notices title | Automated |
| Search isolation | Other department student sees no ICT offering | Learning + academic context | `/api/me/search` | Automated |
| Lecturer workspace | No student dashboard/search | RBAC | 403 | Automated |
