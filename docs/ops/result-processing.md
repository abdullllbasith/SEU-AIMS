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
