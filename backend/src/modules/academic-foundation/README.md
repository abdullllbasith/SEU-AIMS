# academic-foundation

**Owns:** Department, batch/cohort, academic year, semester, subject, subject offering, lecturer assignment, student academic context.

**Must not own:** Official resources, results, or CA applications.

Import `index.js` from other modules. Do not reach into private helpers.

## Administration rules

- Subject codes and registration numbers are immutable after create.
- Subject offerings are unique per subject + batch + academic year + semester.
- Offering audience for the current curriculum period is still derived from a student's current batch/year/semester. Repeat and arrear membership is a separate `SubjectEnrollment` record, not a field on the offering.
- Lecturer assignment identity is lecturer + offering. Revoke sets `isActive` false; reassignment reactivates the same row.
- Only verified, active lecturers can be assigned. Lecturers cannot self-assign.
- Current year/semester on student context is explicit admin data. Changing it writes history rows and does not encode institutional progression rules.
- Records are archived, not hard-deleted. Department administrators can restore an archived academic year or semester to `ACTIVE` from Academic admin. Permanent delete is available only for archived years and semesters with no remaining references (semesters must be removed before their year).

## Shared academic structure

Academic years (sequences 1–4) and semesters (sequences 1–2 on each year) are department-wide records. New intakes are batches, not new years. Archiving a year or semester is refused when an active batch is currently in that period or needs it as the immediate next progression step. Duplicate year sequences return HTTP 409.

## Batch progression (admin)

`GET/POST /api/academic/batches/:batchId/progression` — department administrators only. Moves an active, verified batch one semester forward along the fixed Year 1 Semester 1 → … → Year 4 Semester 2 path. Active student contexts that match the batch’s **current** period move with the batch; archived contexts and active contexts on another period are unchanged.

**MongoDB:** progression uses multi-document transactions. The deployment must use a **replica set** (including Atlas and single-node replica sets). A standalone `mongod` without replica-set configuration fails at runtime with transaction errors; the API still starts, but progression requests fail until Mongo is configured correctly.

**Audit:** batch, matching student contexts, and history rows commit inside one transaction. The success audit (`academic.batch.progress`) is written **after** commit. If that audit insert fails, progression is **not** rolled back and is **not** retried; the failure is logged (`Batch progression succeeded but audit write failed`) for operators to investigate.

## Repeat and arrear enrollment (admin)

`POST /api/academic/subject-offerings/:offeringId/enrollments` creates one enrollment. The administrator chooses `REPEAT` or `ARREAR`. The server copies department, batch, student, registration number, and subject from the offering and the student academic context. An optional `academicResultId` must already belong to that student and subject; when present, the original academic year and semester are copied from that official result. Enrollment does not create or update official results, GPA snapshots, student context, batch membership, academic history, offerings, or lecturer assignments. Failed grades are not required and are not detected automatically.

`GET` on the offering or on `/api/academic/students/:contextId/enrollments` lists enrollments. `PATCH /api/academic/enrollments/:enrollmentId` with `{ "status": "CANCELLED" }` marks the row cancelled and keeps it. Reactivation through PATCH is rejected.

**Re-enrollment:** a partial unique index allows only one `ACTIVE` row per student and subject offering. After cancellation, a new `POST` creates another `ACTIVE` row. The cancelled row remains. A second active enrollment for the same student and offering returns HTTP 409, including when two creates race.

`GET /api/academic/admin/reconciliation` reports students without academic membership, memberships that do not point at a student, active assignments held by lecturers who are not active and verified, and semester/year mismatches. It does not create, move, or revoke records. There is no separate profile collection: student membership is `StudentAcademicContext`, and lecturer verification is stored on the user.
