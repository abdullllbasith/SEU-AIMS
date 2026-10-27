# Data dictionary (collections)

MongoDB only. Field lists are the important identities, not every schema path.

| Collection (model) | Owner | Identity / uniqueness | Notes |
|---|---|---|---|
| User | authentication | email (login) | Role + accountStatus. No registration number here |
| StudentAcademicContext | academic-foundation | registrationNumber unique | Current year/semester |
| StudentAcademicHistory | academic-foundation | per context progression | Past year/semester |
| Department, Batch, AcademicYear, Semester, Subject | academic-foundation | codes in department | ACTIVE/ARCHIVED |
| SubjectOffering | academic-foundation | subject+batch+year+semester | Teaching instance |
| LecturerAssignment | academic-foundation | lecturer+offering | Revoke keeps the row |
| OfficialResource | learning-environment | offering + file | Publish ≠ upload |
| Conversation, Message, ConversationKeyEnvelope | study-room | membership | Ciphertext only on Message |
| AcademicResult | results | registrationNumber+subjectCode | Repeat updates this row |
| ResultRevision | results | per result | History of codes |
| ResultImport, ResultImportRow | results | import id | Not official until COMMITTED |
| IncompleteCa | ca-recovery | per official E(CA) result | OPEN / IN_APPLICATION / RESOLVED |
| CaApplication | ca-recovery | applicationId; one active per student+year+semester | See enums |
| CaApplicationSubject, CaSchedule | ca-recovery | links + calendarEventId | Complete does not write AcademicResult |
| GpaSnapshot | gpa-cgpa | student + scope | Derived |
| Notice | notices-calendar | notice id | Content |
| CalendarEvent | notices-calendar | _id; sourceModule+source id | Representation |
| Notification | notifications | idempotencyKey unique | Delivery, not notice body |
| StoredFile | files | opaque key | Scan vs review states |
| AuditEvent | audit-security | append-only | No in-place edit |

Admin dashboard KPIs are **not** a collection. See [admin-operations.md](../ops/admin-operations.md). Lecturer workspace summaries are also derived, not stored. See [lecturer-workspace.md](../ops/lecturer-workspace.md).

## Enums (code constants)

See `backend/src/modules/*/constants.js` and `backend/src/shared/constants/roles.js`.

CA application: `DRAFT`, `SUBMITTED`, `UNDER_VERIFICATION`, `APPROVED`, `REJECTED`, `SCHEDULED`, `COMPLETED`, `RESOLVED`.  
Physical: `NOT_STARTED`, `AWAITING_PHYSICAL`, `PHYSICALLY_VERIFIED`, `VERIFICATION_FAILED`.  
Do not treat those as one field.

Result import: `UPLOADED` … `COMMITTED` / `PARSE_FAILED` / `REJECTED_FILE` (see `results/constants.js`).

Notification status includes `SENT` and `DELIVERED` as **separate**. SENT is not proof of inbox delivery on WhatsApp/email.

File Study Room: `UPLOADING` → quarantine/scan → `AVAILABLE` or fail states. Scanner down ⇒ not SAFE.

## State transitions

Services reject illegal jumps (CA workflow, resource publish, file scan). Do not PATCH a status because the UI showed a button.
