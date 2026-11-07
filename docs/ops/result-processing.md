# Result processing

Official results stay in the results module. GPA, CA recovery, and dashboards consume them. They do not choose the official grade.

Identity is **registration number + subject code**. Names in a file are preview only. Unknown registration numbers do not create students. Unknown subject codes do not create subjects. Subject names are never used as the match key.

## Who can do what

| Action | Department administrator | Lecturer | Student |
|---|---|---|---|
| Upload, review, commit, reject, reprocess | Yes | No | No |
| Search official records and version history | Yes, own department | No | No |
| Department counts and reconciliation | Yes | No | No |
| Download the uploaded source file | Not exposed by the results API | No | No |
| View own current results | No | No | `GET /api/results/me` |

## Supported files

PDF and XLSX only, after the file scan marks the object safe.

Confirmed XLSX layouts:

- A header row containing a registration column, a subject-code column, and a result column.
- A header row where subject codes themselves are columns.

Confirmed PDF behavior: text tokens that already contain a registration number, a subject code, and a result. Page layout that does not expose those tokens fails closed (`PARSE_FAILED` or blocked rows). No other departmental PDF layout is claimed.

Parser version recorded on the import: `results-parser-1`. A later parser change must not rewrite a committed import.

## Review

Each row keeps the source registration, subject, and result text plus the normalized values used for matching.

| Classification | Meaning |
|---|---|
| NEW | No official row for that identity |
| UPDATE | Official row exists and the incoming code differs |
| UNCHANGED | Official row already has this code |
| SKIP | Not committed |

Blocked rows include unknown students, unknown subjects, unknown grades (anything outside the confirmed DICT grade list and `E(CA)`), and conflicting duplicates. If the same identity appears twice with different codes, **both** rows are blocked. The system does not pick one.

Commit writes only `VALID` rows marked `NEW` or `UPDATE`. Repeating commit on an already committed import returns the same import and does not add another official row. A second request while status is `COMMITTING` is rejected. If the write fails, status becomes `COMMIT_FAILED` and a later commit can continue rows that were not marked committed.

Reject sets `CANCELLED` and does not change official results. Reprocess reads the same stored file, increments the attempt, and replaces preview rows. It is refused after commit.

## Downstream

After a successful commit the official rows stay committed even if a notification or GPA recalculation fails. Those failures are counted on the commit audit and logged. `E(CA)` still upserts an incomplete-CA condition. A later non-`E(CA)` official value marks that condition resolved. CA applications are not deleted.

## Analytics and reconciliation

`GET /api/results/analytics` returns department counts: official rows, current `E(CA)` rows, revisions, import status counts, and current result-code counts. It does not rank students and does not invent grade bands.

`GET /api/results/reconciliation` reports mismatches only. It does not change grades. It can report an `E(CA)` row without an open incomplete-CA condition, an open condition whose result is no longer `E(CA)`, and imports still in `UPLOADED`, `PROCESSING`, or `COMMITTING`. Age alone does not fail an import.

## Not decided here

Manual grade correction outside a new import, file retention expiry, and small-count suppression on analytics are not implemented. Do not treat this document as a new academic rule for those cases.

## Single writer for official grades

Every change to an official grade goes through `applyOfficialResultChange` in `backend/src/modules/results/services/official-result-writer.js`. Today two paths call it: import commit (`IMPORT_COMMIT`) and approval of an import-sourced CA recovery review (`IMPORT_SOURCED_REVIEW`). Behaviour is unchanged. Each `ResultRevision` written now records a `changeKind`; older rows do not have one.

`backend/tests/unit/official-result-writer-boundary.test.js` fails if any other source file creates, updates or deletes an `AcademicResult` or assigns `resultCode`. Period realignment may only touch period and offering fields.

Not yet implemented: Board references, a shared grade-cap service, and the publication modes described in the approved plan. They are later phases and stay off until approved.

## Assessment schemes, course terms and the unified repeat cap (Phase 2, all off by default)

- `backend/src/modules/academic-foundation/data/assessment-schemes.json` holds CA/ESA weights for the 97 course codes in the BICT handbook tables 3.9.3 to 3.9.8: 52 at 40/60, 37 at 50/50, 3 at 60/40 (CMS31022, NST32021, SWT32031), 4 at 100 with no ESA (SWT40016, NST40046, SWT42016, NST42016). CMS11041 has a blank handbook cell and is `UNVERIFIED` with no weights. A test compares the file with the handbook extract.
- `OfferingAssessmentConfig` (versioned per offering) and the optional course-terms fields on `CurriculumMapping` exist as schema only. Nothing reads them. GPA, CA recovery and imports behave as before. No migration or backfill has been run.
- `GRADE_CAP_MODE` controls the shared cap in `results/services/grade-cap.js`. `LEGACY` (default) returns exactly the old repeat-grade decision. `SHADOW` returns the old decision and attaches `capShadowDiff` where the unified policy would differ. `ENFORCED` applies the unified policy and needs written department confirmation first.
- Handbook-confirmed: E, D and C- upgrade to a maximum of C (section 5.6 ii, iii). Not confirmed: whether E(CA), E(ESA) and E(CA&ESA) count as E for that cap. They keep today's handling in every mode.

## CA recovery marks and publication (Phase 3, off by default)

Set `ASSESSMENT_MARKS_ENABLED=true` to turn it on. While it is off, every `/api/assessment` route answers 404 and the lecturer and administrator panels do not appear. The existing import and review paths are unchanged.

Flow after the recovery CA exam:

1. The lecturer marks attendance and completes the subject as today.
2. The lecturer opens a marks entry for each attended student, enters the **CA mark only** (0 to 100), and submits. The lecturer never enters an ESA mark. The Examination unit runs the ESA (handbook 4.1).
3. The administrator verifies the sitting and enters the ESA mark from the Examination unit sheet. The system computes the weighted mark and proposes a code: `E(CA&ESA)`, `E(CA)` or `E(ESA)` for a failed component (Table 5.3, pass marks CA 40 and ESA 35, section 5.6 iv), otherwise the Table 5.5.1 band. The bands are for reference only (section 5.5). The administrator can return a sitting with a reason.
4. The administrator records the Board or Senate reference (`GRADE_PUBLICATION`). The system links the reference. It cannot check that the Board met.
5. The administrator publishes. This goes through `applyOfficialResultChange` with kind `ATTEMPT_PUBLISH`, then syncs the incomplete-CA condition and recalculates GPA. Publishing twice changes nothing. A `ResultRevision` row records the attempt and the authorization.

Rules enforced at publish:

- A code other than the proposal needs a recorded `GRADE_OVERRIDE` for that exact code.
- A grade above C replacing `E(CA)` needs a recorded `CAP_DECISION` naming the code to publish. The handbook does not say whether `E(CA)` counts as E for the maximum-C rule (5.6 ii), so the system does not decide it.
- A failed CA keeps `E(CA)`. The sitting is marked published and no grade changes.

Repeat counting: a first sitting that is not excused counts, and the next one is a repeat. At most three repeats after the fresh sitting (handbook 4.3.4). A fourth is refused unless a `GRACE_CHANCE` authorization exists for the result. An approved medical does not count and keeps fresh status (4.3.2). A rejected one counts. Late notice or a late document is flagged for the Senate and never rejected automatically. The handbook medical rules cover examinations. Applying them to CA absences is an assumption.

Not built: corrections, void, grace chance entry screen, registration, semester standing, and the lecturer approval lockdown (`RESULT_PUBLICATION_MODE`). A lecturer can still approve an import-sourced CA review through the old path until that lockdown ships.
