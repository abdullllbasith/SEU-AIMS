# Final system audit (Prompt 17)

**Repository:** SEU-AIMS `0.1.0` (`seu-aims` workspace)  
**Audit date:** 2026-09-15  
**Environment:** Developer workstation (Windows), Node 20, `mongodb-memory-server` for tests. **Not** a hosted staging/production cluster.

Evidence below is from **this session** unless noted. Earlier agent reports were treated as claims, not proof.

---

## Executive summary

SEU-AIMS is a MERN **scalable modular monolith** for a department VLE/LMS: three roles only, student-only Study Room, official results keyed by **registration number + subject code**, CA Recovery with **physical** verification and **no grade write** on complete, GPA derived from official rows using the inspected DICT calculator map.

**What works (test-backed on this machine):** login/RBAC, academic structure, official resources, Study Room auth + ciphertext persistence, result import/upsert, E(CA) → incomplete CA, CA workflow/PDF token, notices/calendar/notifications fanout, dashboard composition, audit append-only, webhook HMAC, Redis job-list unit tests, frontend production build.

**What does not:** production object-storage adapter; live email/WhatsApp/scanner; measured 1000+ load; hosted deploy/smoke; backup restore; human UAT; browser E2E; Socket.IO multi-instance proof.

**Biggest risks:** file workflows cannot run in `NODE_ENV=production` until a real storage driver exists; jobs/dashboard cache are process- or Redis-local; no outbox; GPA/login-id/retention remain **institutionally unconfirmed**.

**Most important evidence:** backend **180 pass / 0 fail / 0 skip**; frontend **9 pass**; `npm run build` + `check:bundle`; `check:docs`; `check:secrets`; `npm audit --omit=dev` **0** production vulnerabilities.

**Release decision:** **READY WITH KNOWN LIMITATIONS** — suitable for **handover and controlled staging**, not for claiming production-complete hosting, provider delivery, capacity, compliance, or disaster recovery.

---

## System status

| Area | Status | Evidence (this session unless noted) |
|---|---|---|
| Functionality | Partially Verified | Module tests + UI routes exist; no browser E2E |
| Academic Integrity | Verified (code + tests) | Results unique index, GPA engine tests, CA complete does not write `AcademicResult` |
| Security | Partially Verified | IDOR/RBAC/webhook tests; no pentest; Vitest advisory in **dev** |
| Reliability | Partially Verified | Concurrency uniqueness tests; no outbox; Redis wipe loses jobs |
| Performance | Unverified | Not measured |
| Scalability | Partially Verified | Stateless API design; dashboard `Map` cache is process-local; sockets unproven ×N |
| Testing | Verified (automated) | 189 tests pass; UAT/E2E browser absent |
| Deployment | Partially Verified | Compose **config** validated previously; `up`/host smoke **not** this session |
| Documentation | Verified | Handbook + `check:docs` pass |
| Maintainability | Partially Verified | Module READMEs; some services import another module’s **models** directly |

---

## Architecture findings

- One Express app (`register-modules.js` lists 12 logical modules), one React app, workers as the same codebase. **Not** microservices.
- Stack present: React, Express, Mongo, Redis client, in-memory or Redis job lists, Socket.IO, email/WhatsApp/scanner **adapters**, file **interface**.
- **Debt:** several services import `User` / `AcademicResult` / CA models from other modules instead of `index.js` only (e.g. `gpa.service.js` → `results/models`, `integrity.service.js` reads many models). Boundaries are documented, not fully enforced by imports.
- Process-local: dashboard cache (`dashboard-cache.js` `Map`, 15s TTL); in-memory queue when Redis is disconnected.
- `files` HTTP router is **empty**; file HTTP lives on learning / study-room / profile / CA / results.

---

## Module completeness matrix

| Module | Backend | Frontend | Database | Events/jobs | Workers | Tests | Docs | Status |
|---|---|---|---|---|---|---|---|---|
| Authentication/RBAC | Yes | Login/reset | User, sessions | Audit on mutations | — | auth + roles | Yes | Implemented |
| Academic Foundation | Yes | Student/lecturer/admin pages | Structure models | — | — | integration + policies | Yes | Implemented |
| Learning Environment | Yes | Learning pages | OfficialResource | scan job | files.malware-scan | learning tests | Yes | Implemented |
| Study Room | Yes | Student page + crypto | Conversations/messages | sockets | scan | policies + integration | Yes | Implemented |
| Results | Yes | Student + admin import | AcademicResult, imports | parse, eca, gpa jobs | yes | parsers + results | Yes | Implemented |
| GPA/CGPA | Yes | Performance via `/api/me` + `/api/gpa/me` | GpaSnapshot | gpa.recalculate | yes | gpa-engine | Yes | Implemented |
| CA Recovery | Yes | Student/lecturer/admin | Applications, incomplete | PDF, reminders | yes | ca-recovery | Yes | Implemented |
| Notifications | Yes | Inbox | Notification | deliver/reminder | yes | communication | Yes | Implemented |
| Notices | Yes | Notices pages | Notice | fanout on publish | via notifications | communication | Yes | Implemented |
| Calendar | Yes | Calendar page | CalendarEvent | reminders | yes | communication | Yes | Implemented |
| Student Experience | Yes | Dashboard/profile/history | none (compose) | cache invalidation | — | student-experience | Yes | Implemented |
| Audit/Security | Yes | Admin ops | AuditEvent | — | — | audit + webhooks | Yes | Implemented |
| File Management | Library yes; `/api/files` empty | via domains | StoredFile | malware-scan | yes | file/scan tests | Yes | Partial HTTP |
| Background Processing | worker-entry | — | Redis lists | JOB_NAMES | drain loop | job-queue + orchestration | Yes | Implemented |

Frontend is presentation; GPA is not computed in the browser.

---

## Requirement traceability

| Requirement | Source | Implementation | Test | Evidence | Status |
|---|---|---|---|---|---|
| Three roles | Master rules | `roles.js`, admin create rejects `HOD` | `roles.test.js` | Code | Verified |
| Academic hierarchy | Prompt 05 | academic-foundation | academic-foundation.test.js | Code | Verified |
| Current vs historical semester | Context + history | StudentAcademicContext | academic + student-experience | Code | Verified |
| Official resources on offering | Prompt 06 | learning-environment | learning-environment.test.js | Code | Verified |
| Study Room student-only | Master rules | requireRole STUDENT + ProtectedRoute | study-room + object-authorization + ProtectedRoute | This session tests | Verified |
| E2E chat fields | Prompt 07 | ciphertext schema + WebCrypto | encryption + study-room-crypto | Code | Verified (not Signal) |
| Shared student files | Study Room | scan + moderation | study-room.test.js | Code | Verified |
| Malware fail-closed | Files | noop ≠ clean | auth-boundary + study-room | Code | Verified |
| Result import | Prompt 08 | PDF/XLSX parsers | result-parsers + results | Synthetic only | Verified |
| Repeat-student upsert | Prompt 08 | unique registration+subject | results.test.js | Code | Verified |
| E(CA) | Prompt 08/09 | isEca + IncompleteCa | results + ca-recovery | Code | Verified |
| CA Recovery + physical | Prompt 09 | workflow + PDF/QR | ca-recovery.test.js | Code | Verified |
| Lecturer CA schedule | Prompt 09 | assignment-scoped | ca-recovery.test.js | Code | Verified |
| Notifications | Prompt 10 | fanout + channels | communication.test.js | In-app verified; providers noop | Partial |
| Calendar representation | Prompt 10 | CalendarEvent | communication | Code | Verified |
| Profile | Prompt 11 | `/api/me/profile` | student-experience + mass-assignment | Code | Verified |
| Performance/GPA | Prompt 11/GPA | presentGpaSummary | gpa-engine + student-experience | Calculator snapshot | Verified in code |
| Audit | Prompt 12 | append-only | audit-security.test.js | Code | Verified |
| Modular monolith | Master rules | workspaces + modules | module-boundaries.test.js | Code | Verified |
| Deployment artifacts | Prompt 15 | deploy/ + ops docs | compose config (prior); not `up` here | Partial |

---

## Source-of-truth audit

Matches `docs/architecture/source-of-truth.md` in code intent. CA complete does not write `AcademicResult` (no such writes in ca-recovery). GPA reads official rows. Dashboard uses `presentGpaSummary` (zero credits → `available: false`, not a fake 0.00 UI). Calendar is a representation (`sourceModule`). Integrity checks diagnose, do not auto-repair.

---

## Academic integrity findings

- Result identity unique index: registrationNumber + subjectCode (`persistence-indexes.test.js`).
- Repeat import updates the same row + revision (results integration).
- E(CA) excluded from GPA map (`gpa-engine.test.js`).
- Completing CA does not create grades.
- Physical HOD signature is copy on the PDF, not a login role.
- **Unconfirmed:** whether DICT bands are the department’s official policy.

---

## Security findings

- Default-deny API; CSRF on mutations; Argon2id; HttpOnly JWT cookies.
- IDOR: other-student results `studentId` 403; CA PDF 404; calendar other dept 404; notification mark-read 404 (object-authorization, this session suite).
- Mass assignment: profile role/department 403.
- Sockets: lecturer cannot join Study Room (study-room integration).
- Webhooks: unsigned WhatsApp POST 401.
- Logs: redaction unit tests.
- Audit: mutations 400.
- Secret scan: pass (working tree, not git history).
- Production `npm audit --omit=dev`: 0. Full audit including Vitest: residual **dev** moderate (documented).
- **Not claimed:** OWASP/GDPR/ISO, pentest, “fully secure”.

---

## Integration / reliability

- Jobs: Redis lists when connected; worker drain; per-job `markFailed`.
- No outbox (crash between commit and enqueue).
- Concurrency: notification fanout + CA draft uniqueness tests.
- Failure: scanner unavailable fail-closed; providers classified, not live-injected against Meta.
- Integrity: `GET /api/ops/integrity` diagnostic.

---

## Performance / scalability

- **Load classification:** not measured.
- Bundle: `index-CtQap-pM.js` 393.54 kB / 117.14 kB gzip (this session).
- Do **not** claim 1000+ users.
- Multi-instance: API designed stateless; dashboard cache is in-process; Socket.IO adapter wired, **not** load-tested.

---

## Testing findings

| Suite | Pass | Fail | Skip |
|---|---:|---:|---:|
| Backend `npm test` | 180 | 0 | 0 |
| Frontend Vitest | 9 | 0 | 0 |
| **Total** | **189** | **0** | **0** |

No Playwright/Cypress. Human UAT not executed. LoginPage `act(...)` stderr only; tests still passed.

---

## Deployment / operations

- Production config gate exists (JWT, CORS, Mongo, Redis, no `local_dev`, no localhost public URL).
- **Object storage:** only `local_dev` implements put/get. Production forbids `local_dev` → **file features fail closed in production** until an adapter exists.
- Backup/restore: **documented only**.
- Disaster recovery: **not configured / not tested**.
- Providers: implemented adapters; **mocked/noop**; production-tested: **no**.
- Compose file syntax was validated in Prompt 15; **this session did not run `docker compose up`**.

---

## Documentation / handover

Handbook, ADRs, ops runbooks, env reference present. `check:docs` passed. ADR 0001 stale “pages not implemented” line corrected in this audit.

---

## Blockers / issues

### Exact release blockers (for *unattended production with files and live channels*)

None that fail the automated academic/security suite. **Operational blockers** if someone claims full production tonight:

1. No production file driver  
2. No hosted smoke  
3. No restore drill  
4. No live provider proof  
5. No human UAT  

### Critical

None opened from this session’s failing tests (there were none).

### High

- Production file storage unimplemented  
- No outbox  
- Socket.IO ×N unverified  
- Dashboard cache not shared across API instances  

### Medium

- Cross-module model imports  
- Empty `/api/files` router  
- Parsers only synthetic layouts  
- Vitest 3.x advisory (dev)  

### Low

- jsdom `act(...)` warnings  
- No OpenAPI generator  

### Technical debt

See `docs/architecture/integration-debt.md` plus import-boundary leaks and process-local dashboard cache.

---

## Known limitations

Same as `docs/limitations.md`. GPA/login/retention labeled **unconfirmed**.

## Unresolved institutional decisions

- Official GPA/class policy vs DICT snapshot  
- Login identifier (email vs registration number)  
- Legal retention / RPO / RTO / SLOs  
- Production host ownership and TLS domain  

---

## Final handover sign-off (team)

- [x] Source code present  
- [x] Tests reproducible (this session)  
- [x] Build reproducible (this session)  
- [x] Environment documented  
- [x] Deployment documented  
- [x] Secrets externalized (templates empty)  
- [ ] Backups addressed (docs only)  
- [x] Critical workflows demonstrated **in automated tests**  
- [ ] Critical workflows demonstrated **with humans on staging**  
- [x] Security reviewed (automated; not certified)  
- [x] Known issues documented  
- [ ] Ownership assigned (people, not git)  
- [x] Release decision recorded (this file)

---

## Evidence (this session)

```
backend npm test: 180 pass, 0 fail, 0 skip
frontend vitest: 9 pass
check:docs: pass
check:secrets: pass
vite build: pass (113 modules)
check:bundle: pass
npm audit --omit=dev: 0 vulnerabilities
```

---

## Final release decision

**READY WITH KNOWN LIMITATIONS**

Not **READY** (no target-environment smoke, no restore, no load, production files broken by design until a driver exists).  
Not **NOT READY** (no failing critical academic/security tests; architecture and workflows are present and tested).

## Recommended next actions

1. Implement and test an S3-compatible file driver against MinIO/staging.  
2. Staging `compose up`, TLS, human UAT (`docs/qa/uat-scenarios.md`).  
3. Two-API Socket.IO check.  
4. Backup restore drill.  
5. Faculty confirm GPA/login/retention.  
6. Do not advertise 1000+ users, WhatsApp delivery, or compliance certificates.
