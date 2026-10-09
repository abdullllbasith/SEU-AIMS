# academic-foundation

**Owns:** Department, batch/cohort, academic year, semester, subject, subject offering, lecturer assignment, student academic context.

**Must not own:** Official resources, results, or CA applications.

Import `index.js` from other modules. Do not reach into private helpers.

## Administration rules

- Subject codes and registration numbers are immutable after create.
- Subject offerings are unique per subject + batch + academic year + semester.
- Offering audience is derived from a student's current batch/year/semester; student lists are not stored on offerings.
- Lecturer assignment identity is lecturer + offering. Revoke sets `isActive` false; reassignment reactivates the same row.
- Only verified, active lecturers can be assigned. Lecturers cannot self-assign.
- Current year/semester on student context is explicit admin data. Changing it writes history rows and does not encode institutional progression rules.
- Records are archived, not hard-deleted.

`GET /api/academic/admin/reconciliation` reports students without academic membership, memberships that do not point at a student, active assignments held by lecturers who are not active and verified, and semester/year mismatches. It does not create, move, or revoke records. There is no separate profile collection: student membership is `StudentAcademicContext`, and lecturer verification is stored on the user.
