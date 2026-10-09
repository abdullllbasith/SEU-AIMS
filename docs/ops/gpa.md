# GPA and CGPA

GPA/CGPA is calculated only in `gpa-cgpa`. Official results stay in the results module. Student pages display the calculation. They do not compute it.

## Rule source

Grade points, `Σ(credits × points) / Σ(credits)`, `round2`, and class bands are the inspected DICT-SEUSL GPA Calculator (`app.js`, inspected 2026-09-15). Calculation version stored on each snapshot: `DICT-SEUSL-GPA-1`.

There is no D+. `E(CA)` and any code outside that map are excluded. They are not given grade points. Credits come from the subject record. A missing subject is `MISSING_CREDITS` and is left out of the average. A subject with `countsForGpa: false` is excluded as NGPA. The current official result for a registration number and subject code is the one that counts. A later import updates that result. GPA then uses the new value.

If nothing is counted, the snapshot is `UNAVAILABLE` and stores no GPA number. The student UI does not show `0.00` for that case.

## When it recalculates

A result commit recalculates the affected student. Repeating the same inputs does not rewrite the snapshot. Opening the performance page does not recalculate. If official results have changed and the snapshot has not been rebuilt, the student response is `STALE` and the old number is not shown as current.

Department administrators can load counts at `GET /api/gpa/admin/quality` and rebuild this department at `POST /api/gpa/admin/rebuild`. The rebuild does not edit a grade and does not rank students.

## Not decided here

A separate GPA notification, an official transcript layout, and a privacy cutoff for small aggregate groups are not defined, so they are not implemented. Result commit already notifies the student that results were updated.
