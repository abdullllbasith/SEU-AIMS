# Coding standards

Match existing code. Do not introduce a second style guide.

- ESM (`"type": "module"`).
- Domain rules live in the owning module’s services, not in React, workers, or `shared/`.
- Other modules import `index.js` only.
- Errors: `AppError` subclasses; no stack traces in JSON.
- Do not log secrets, tokens, or chat plaintext.
- Tests: clear names (`student_cannot_read_another_students_result`).
- Do not disable tests to go green.
- Do not add application roles.
- Do not use `CA1`/`CA2` in identifiers or copy.
