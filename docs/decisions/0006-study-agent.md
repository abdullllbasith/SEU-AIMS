# 0006 — Study Agent is a student-only, read-only AI tutor

## Status

Accepted.

## Decision

The Study Agent lives in its own `study-agent` module and appears as a tab in the Study Room. It follows ADR 0004: only an active student with an academic context may use it; lecturers and administrators are denied.

- **Read-only toward official data.** It never writes grades, results, GPA snapshots, CA records or Study Room data. Academic facts it later uses come from the owning modules' public functions.
- **No chat access.** Study Room messages are end-to-end encrypted. The agent reads only batch shared files a student could already download.
- **One authorisation gate for AI context.** Allowed files are rebuilt on every request from the existing visibility rules. Quarantined, unsafe, unpublished, removed or unavailable files never enter a prompt, even if indexed earlier.
- **Untrusted content.** Document text is delimited and the model is told not to obey it. Student input is never passed to Mongo as an operator.
- **Credentials stay on the server.** The AI provider is an adapter (`noop`, `dev_mock`, `gemini`); `dev_mock` is refused in production.
- **Honest labelling.** Every answer carries its sources, or is labelled general AI knowledge.

## Consequences

`study-agent` depends on `academic-foundation`, `learning-environment`, `files`, `study-room` (one read export) and later `results`, `gpa-cgpa`, `ca-recovery`. That adds a `study-room` read dependency not previously listed; it is recorded in `cross-module-dependencies.md`. Retrieval is keyword-based (MongoDB text index) rather than semantic.
