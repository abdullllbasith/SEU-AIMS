# Persistence model

MongoDB is the authoritative store. Models live in owning modules. Redis, UI state, and process memory are not sources of truth.

```text
Department
  └── Batch
        └── StudentAcademicContext (registration number, current year/semester)
              ├── StudentAcademicHistory (past year/semester rows)
              ├── AcademicResult (registration number + subject code)
              │     └── IncompleteCa → CaApplication → CaApplicationSubject
              │           └── CaSchedule.calendarEventId → CalendarEvent
              ├── GpaSnapshot (derived only)
              └── Notification (separate records)
Subject
  └── SubjectOffering (subject + batch + year + semester)
        ├── LecturerAssignment (lecturer + offering; multiple lecturers allowed)
        └── OfficialResource (offering + file metadata)
Conversation / Message (encrypted payload)
StoredFile (scan vs review; binary in object storage)
AuditEvent
ResultImport / ResultImportRow  ≠  AcademicResult
```

Subject is the reusable definition. Subject Offering is the teaching instance. Repeat students keep one identity (`registrationNumber`) and update the existing official result for that subject code.

Academic structure entities (`Department`, `Batch`, `AcademicYear`, `Semester`, `Subject`, `SubjectOffering`, `StudentAcademicContext`) use `ACTIVE | ARCHIVED`. Lecturer assignment rows are retained after revoke (`isActive` / `revokedAt`).
