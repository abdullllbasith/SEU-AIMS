# Observability

## Correlation

HTTP requests receive `X-Request-Id` and `X-Correlation-Id` (incoming `x-correlation-id` is reused). Job enqueue copies `correlationId` into the payload when a request context exists.

## Logs

Structured JSON. Passwords, tokens, cookies, keys, chat ciphertext, emails, phones, registration numbers, and result codes are redacted when passed as meta keys.

Request bodies are not logged globally.

Production 5xx responses are generic (`Internal error`). Stack traces are not returned to clients.

## Health

- `GET /api/health` and `GET /api/health/live` — process liveness. Not dependent on WhatsApp.
- `GET /api/health/ready` — configuration readiness (JWT present). Provider outages are listed as notes, not as process death.

## Metrics / queues

Department administrators may read counts at `GET /api/ops/metrics` and `GET /api/ops/queues`, and diagnostic integrity at `GET /api/ops/integrity`. These are in-process counters plus in-memory queue depth. They are not a hosted APM product.

## Audit

Append-only `AuditEvent` documents. `GET /api/audit/events` and `/summary` are department-scoped. Mutation routes return validation errors. IP is stored hashed and is not returned.

`AUDIT_RETENTION_DAYS=0` means retention policy is **not configured**; rows are not auto-deleted.
