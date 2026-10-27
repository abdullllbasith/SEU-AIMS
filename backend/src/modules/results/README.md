# results

**Owns:** Official result import, parse, validate, preview, admin confirm/commit, academic records, repeat-student matching by **registration number + subject code**.

**Must not own:** GPA formula (see `gpa-cgpa`) or CA application workflow. The parser never commits official records. Students are never created from unmatched import rows. Subject codes that are missing from Academic Foundation are blocked, not auto-created.

## Matching

Canonical identity for an official result is `{ registrationNumber, subjectCode }` (unique index). Display names in source files are preview-only.

Repeat students keep the same registration number. A later import updates the existing official row and appends `ResultRevision`; it does not create a second student.

## Import lifecycle

`UPLOADED` → scan → `PROCESSING` → `READY_FOR_REVIEW` / `VALIDATION_ISSUES` / `PARSE_FAILED` / `REJECTED_FILE`.

Admin actions: `commit` (locks `COMMITTING`, then `COMMITTED` or `COMMIT_FAILED`), `reject` (`CANCELLED`), `reprocess` (same stored file, new attempt, not allowed after commit).

Rows are classified `NEW`, `UPDATE`, `UNCHANGED`, or `SKIP`. Unknown grades and conflicting duplicates are `BLOCKED` and are not committed. An identical incoming grade does not write a new revision.

Parser version stored on each import: `results-parser-1`. Supported layouts are the synthetic narrow-column sheet and subject-code header sheet, plus PDF text that already exposes registration number, subject code, and result as tokens.

PDF and XLSX only. Untrusted uploads go through `StoredFile` (`RESULT_IMPORT`) and must be `SAFE` before parse. Parse and GPA jobs are enqueued for the **worker** (Redis lists when Redis is connected).

## E(CA)

The official result value stays `E(CA)`. Commit upserts `IncompleteCa` (`OPEN`). A later non-E(CA) official value for the same academic result marks that incomplete-CA record `RESOLVED`. CA Recovery applications are not implemented here.

## Known limitations

No real departmental result PDF samples are in this repository. Parsers are verified against synthetic PDF/XLSX fixtures (narrow columns and wide subject-code headers). Layouts that do not expose registration number + subject code + result as extractable tokens will produce `PARSE_FAILED` or blocked rows rather than guessed matches.
