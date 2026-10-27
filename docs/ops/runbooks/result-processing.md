# Result processing runbooks

Official grades are changed only by a reviewed import commit. These notes do not authorize editing a grade in the database.

## Import stuck

- **Symptoms:** status stays `UPLOADED`, `PROCESSING`, or `COMMITTING`. Reconciliation lists `IMPORT_NOT_TERMINAL`.
- **Check:** file scan status, worker logs for `results.parse`, and whether a commit request is still running.
- **Action:** if the file is safe and the import is not committed, use reprocess. Do not mark it failed only because it is old.
- **Evidence:** import id, processing status, parser version, attempt number.

## Parser failed

- **Symptoms:** `PARSE_FAILED`, failure code `PARSE_EXCEPTION`, `NO_ROWS`, or `FILE_MISSING`.
- **Check:** the file is PDF or XLSX and the text or header actually contains registration number, subject code, and result.
- **Action:** correct the source file and upload it as a new import, or reprocess after the stored file is still the one you intend. No official rows should exist for that import.

## Unknown students

- **Symptoms:** row error `STUDENT_NOT_FOUND` or `MALFORMED_REGISTRATION_NUMBER`.
- **Action:** fix the registration number in the source file, or create the student in academic administration first. Do not match by name.

## Unknown subject code

- **Symptoms:** row error `SUBJECT_NOT_FOUND`.
- **Action:** confirm the code exists on a department subject. Do not map from the subject title.

## Duplicate conflict

- **Symptoms:** `INTRA_IMPORT_CONFLICT` on every row of that registration number and subject code. Commit refuses those rows.
- **Action:** correct the source so the identity has one result code, then upload or reprocess. Do not choose a row in the preview.

## Commit failure

- **Symptoms:** `COMMIT_FAILED`.
- **Check:** which preview rows already have a commit time.
- **Action:** commit again. Already written rows are skipped. Official rows that were written stay written.

## Downstream GPA failure

- **Symptoms:** import is `COMMITTED` and the commit audit shows downstream failures.
- **Action:** official results stay. Recalculate GPA from the GPA job or the existing GPA service for the affected student. Do not roll back the result.

## E(CA) inconsistency

- **Symptoms:** reconciliation `ECA_WITHOUT_OPEN_CONDITION` or `OPEN_CONDITION_WITHOUT_ECA`.
- **Action:** compare the official result code with the incomplete-CA record. Do not delete the result history. A later official non-`E(CA)` commit is what resolves the condition.

## Result correction

- **Action:** publish the corrected code through a new reviewed import for the same registration number and subject code. That writes a revision and keeps the previous code. There is no preview field for typing a grade.

## Reconciliation issue

- **Action:** use the issue, entity id, and recommended action on `GET /api/results/reconciliation`. The report does not repair official grades.
