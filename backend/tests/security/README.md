# Security tests

Authorization and isolation tests, including:

- student cannot read another student's results (`studentId` query)
- lecturer cannot manage an unassigned subject offering
- lecturer cannot access Study Room
- student cannot perform administrator operations
- mass-assignment / Mongo operator payloads
- webhook and default-deny coverage from earlier prompts

Synthetic identities live in `tests/helpers/qa-fixtures.js` (fictional `SEU/IS/…` values).
