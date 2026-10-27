# gpa-cgpa

**Owns:** Semester GPA, CGPA, classification bands, and student-facing GPA summaries derived from official `AcademicResult` rows.

**Must not own:** A second result store. Do not invent grading formulas.

## Authoritative source

Grade points, semester formula `Σ(credits × points) / Σ(credits)`, `round2`, and class bands are ported from the inspected DICT-SEUSL GPA Calculator:

https://github.com/abdullllbasith/DICT-SEUSL-GPA-Calculator (`app.js` `GRADE_POINTS`)

| Marker | Points |
| --- | --- |
| A+, A | 4.00 |
| A- | 3.70 |
| B+ | 3.30 |
| B | 3.00 |
| B- | 2.70 |
| C+ | 2.30 |
| C | 2.00 |
| C- | 1.70 |
| D | 1.30 |
| E | 0.00 |

There is **no D+** in that map. Do not add markers here.

The calculator’s saved-semester CGPA uses the **best grade per course code** across stored semesters. Official AIMS uniqueness is **one current result per (registrationNumber, subjectCode)**, so after commit there is a single latest official value per subject. Repeat imports update that row; GPA uses the current official value.

Credits come from Academic Foundation `Subject.credits`. `countsForGpa` defaults to **true**. NGPA is only applied when that flag is false. Do not hard-code a CMS NGPA subject list.

## E(CA) and unknown markers

`E(CA)` and any result code absent from `GRADE_POINTS` are **excluded** from the weighted average. They are not mapped to E = 0.00.

## Recalculation

Result commit calls `recalculateStudentGpa`. The stored snapshot keeps calculation version `DICT-SEUSL-GPA-1`, the official result versions used, and a fingerprint of those inputs. An identical fingerprint does not rewrite the snapshot.

`GET /api/gpa/me` does not recalculate. If the stored fingerprint does not match current official results, the response status is `STALE` and no GPA number is returned. A department administrator rebuilds from `POST /api/gpa/admin/rebuild`. `GET /api/gpa/admin/quality` returns counts only.

If no credits are counted, the snapshot status is `UNAVAILABLE` and `value` is null. A missing subject credit is excluded as `MISSING_CREDITS`. It is not treated as zero. `E(CA)` stays excluded.

The backend value is authoritative; the UI must not compute GPA locally.
