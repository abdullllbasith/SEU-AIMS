# Lecturer workspace acceptance (Prompt 20)

API-level checks in `backend/tests/integration/lecturer-workspace.test.js` and existing learning/CA/calendar tests. Browser UAT is **not** marked passed.

| Scenario | Expected | Test | Status |
|---|---|---|---|
| Dashboard assignments | Only own offerings with academic names | integration dashboard | Automated |
| Student/admin | 403 on `/api/lecturer/*` | integration RBAC | Automated |
| Offering B IDOR | Lecturer A 403 | integration IDOR | Automated |
| Search regex | 400 | integration search | Automated |
| Search isolation | No ICT2000 / Secret draft for A | integration search | Automated |
| Revoked assignment | canManage false | integration inactive | Automated |
| Unverified lecturer | no management + attention | integration unverified | Automated |
| CA approve alias | 403 | integration mutation reject | Automated |
| Result mutate alias | 403 | integration mutation reject | Automated |
| Resource upload pipeline | Existing learning tests | learning-environment.test.js | Automated (reused) |
| Study Room | Lecturer 403 | integration + ProtectedRoute | Automated |
| Browser UAT | Human script | — | Not passed |
