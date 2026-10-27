# Threat model (practical)

This is an engineering threat model, not a claim of compliance or penetration-test completion.

| Actor | Typical attempts | Primary controls |
|---|---|---|
| Unauthenticated | Login brute force, enumeration, file upload, QR abuse, oversized bodies | Default-deny API, generic login errors, auth rate limit (Redis when configured), scanner fail-closed, CA verify limiter |
| Student | IDOR, mass assignment, forged academic context, private chat/file access | Principal from session, 404 concealment, forbidden field lists, Study Room membership checks |
| Lecturer | Off-assignment resources/CA, student dumps | Active `LecturerAssignment` |
| Department admin | Cross-department access | `departmentId` on principal vs resource |
| Worker/job | Stale or injected payloads | Reload authoritative documents; do not trust job body as current authorization |

Residual risk: in-memory rate limits and queues when Redis is **not** connected (tests / misconfigured local). Production requires Redis. Socket.IO cross-instance fan-out is wired, not load-tested.
