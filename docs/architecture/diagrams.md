# Diagrams

Source is Markdown/Mermaid in git (not a binary-only image).

## Runtime

```mermaid
flowchart LR
  U[Users] --> P[TLS reverse proxy]
  P --> W[React static]
  P --> A[Express API x N]
  A --> M[(MongoDB)]
  A --> R[(Redis)]
  A --> S[Object storage]
  WK[Workers x M] --> M
  WK --> R
  WK --> S
  A --> WK
  WK --> E[Email / WhatsApp / scanner adapters]
```

## Academic ownership

```mermaid
flowchart TB
  AF[academic-foundation]
  LE[learning-environment]
  SR[study-room]
  RS[results]
  GPA[gpa-cgpa]
  CA[ca-recovery]
  NC[notices-calendar]
  NT[notifications]
  SE[student-experience]
  AF --> LE
  AF --> SR
  AF --> RS
  RS --> GPA
  RS --> CA
  CA --> NC
  CA --> NT
  NC --> NT
  SE --> AF
  SE --> RS
  SE --> GPA
  SE --> CA
  SE --> NC
  SE --> NT
```

## Result → CA → GPA

```mermaid
sequenceDiagram
  participant Admin
  participant Results
  participant CA
  participant GPA
  Admin->>Results: commit import
  Results->>Results: upsert AcademicResult by registration+subject
  Results->>CA: sync IncompleteCa if E(CA)
  Results->>GPA: recalculate snapshots
  Note over CA: application/PDF/physical/schedule
  Note over GPA: does not store official rows
```

CA schedule times live on CA; `CalendarEvent` is a representation with `sourceModule` / source id.
