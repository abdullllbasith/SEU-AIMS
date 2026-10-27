# Frontend routes

`frontend/src/routes/index.jsx`. `ProtectedRoute` hides UI; API still authorizes.

| Path | Roles |
|---|---|
| `/login`, `/forgot-password`, `/reset-password` | public |
| `/`, `/profile`, `/notifications`, `/notices`, `/calendar`, `/learning/offerings/:id` | authenticated |
| `/dashboard`, `/search`, `/academic/history`, `/performance`, `/academic/me`, `/learning`, `/results/me`, `/ca`, `/study-room` | STUDENT |
| `/lecturer`, `/lecturer/search`, `/lecturer/offerings`, `/lecturer/offerings/:id`, `/lecturer/learning`, `/lecturer/ca` | LECTURER |
| `/admin`, `/admin/people`, `/admin/people/students/:userId`, `/admin/people/lecturers/:userId`, `/admin/offerings-health`, `/admin/academic`, `/admin/ops`, `/admin/resources`, `/admin/results`, `/admin/ca`, `/admin/study-room` | DEPARTMENT_ADMINISTRATOR |
