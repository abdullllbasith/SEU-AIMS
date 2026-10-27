# Quality gates

| Gate | Evidence |
|---|---|
| A Build | `npm run build` + `npm run check:bundle` |
| B Regression | `npm test` (backend unit/integration/security + frontend) |
| C Authorization | `npm run test:security` including object-authorization |
| D Critical workflows | Existing results/CA/GPA/notice tests + orchestration |
| E No known blockers | See defects.md / integration-debt |
| F Production config | `assertProductionConfig` + production-checklist |
| G Smoke | `npm run test:smoke` (API). Target-environment smoke still needs a deployed instance |

CI: `.github/workflows/qa.yml`
