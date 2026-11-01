# study-agent

**Owns:** The student-only AI tutor: study sessions and messages, the searchable text index of learning files, retrieval over authorised files, prompt construction, AI usage counters.

**Must not own:** Grades, results, GPA or any academic record (it never writes to them), chat plaintext, file storage or scanning (the `files` module owns those), or official/shared resource visibility rules (it reuses them).

## Authorization

Every route needs `requireRole(STUDENT)` and an active `StudentAcademicContext`. Every query is scoped to `studentUserId = principal.userId`. A foreign, unknown or archived session id returns the same 404. Mutating routes need CSRF.

## What may enter AI context

`services/source-authorization.service.js` is the single gate. It rebuilds the allowed file set on **every message**:

- Official resources of the session's subject offering that are `PUBLISHED`, not deleted, and whose file is `SAFE` and `AVAILABLE` (`isStudentVisibleResource`). The student's access to the offering is re-checked each time through `listAccessibleOfferings`, so a student whose semester changed loses the old subject.
- Batch shared files the student could already download (`AVAILABLE` + `SAFE`), through `study-room`'s `listStudentAvailableSharedResources`. Skipped when Study Room is disabled for the department.

Indexed chunks are never trusted on their own: retrieval is restricted to the allowed file ids, so a file that was indexed and later quarantined, unpublished or removed drops out immediately.

Study Room chat is end-to-end encrypted and is not readable here, by design (see ADR 0004).

Document text is untrusted. It is wrapped in `<untrusted_document>` tags and the system prompt tells the model not to follow instructions inside them.

## Indexing

`files.malware-scan` finishes → if the file is `SAFE`, an official or Study Room file, and PDF or plain text → job `study-agent.index-document` → `indexFile` extracts per-page text (`pdf-parse`), detects headings, stores ~1,200-character chunks (never crossing a page) in `DocumentChunk` with a `$text` index. Indexing is idempotent by checksum. Files that pre-date the agent are queued lazily when a subject session sends a message. This needs the worker process.

## Answers and sources

The model cites excerpts as `[S#]`. The server rewrites those to `[n]` matching the numbered `sources` stored on the message (file + page + section) and drops markers that point at nothing. A reply with no valid citation is labelled `AI_KNOWLEDGE`. Source kinds: `OFFICIAL`, `SHARED`, `UPLOAD`, `WEB`, `ACADEMIC_RECORD`, `AI_KNOWLEDGE` (the last four are used by later stages).

## Limits and failure handling

Per-student per-minute limit (process-local), daily allowance (`AiUsage`, shared), message length cap, context character budget, retrieval top-k. If the provider is unconfigured the API returns 503 `AI_UNAVAILABLE` before storing anything. If the provider fails mid-request the question is kept with `failed: true`, is skipped in later history, and the API returns 503.

## Agent-routed sessions

The student UI is one chat. It creates a session with `mode: AUTO` the first time the student sends or attaches something. For every message `services/route.service.js` makes a small structured model call that picks `SUBJECT` (one of the student's accessible offerings) or `FREE`; follow-ups keep the previous route. The route is validated against `listSubjects`, so a made-up or foreign `offeringId` falls back to `FREE`, and any routing failure keeps the previous route instead of blocking the answer. The chosen route runs through the same source gate as a fixed session and is stored on the agent message as `route` (the UI shows it). `SUBJECT` and `FREE` sessions still exist for older chats.

## Attachments

Students attach JPEG, PNG, WebP images, PDFs and plain text files (`text/plain`, up to 1 MB, no NUL bytes) to a message (paste, drag and drop, or file picker; up to `STUDY_AGENT_MAX_IMAGES` at a time).

- The type is decided from the file's bytes (`detectOfficialContentType`), never from the declared type or the name. Executables, archives, text and Office files are rejected with 415. Images are capped by `STUDY_AGENT_IMAGE_MAX_BYTES`, PDFs by `FILE_MAX_BYTES`, a session by 50 uploads, and uploads by a per-minute limit. A batch is validated completely before anything is stored.
- A file is a `StoredFile` with `owningDomain = STUDY_AGENT_UPLOAD`, `owningContextId = sessionId`, key `study-agent/<userId>/<uuid>`. It starts `SCANNING` and `UNAVAILABLE`; the worker's scan hook (`syncUploadAfterScan`) makes it `AVAILABLE` only after a `SAFE` result. No scanner configured means it stays quarantined and the student sees "Cannot be used".
- Status: `SCANNING` → `READY`, or `BLOCKED`. A message may only use attachments that are the student's own, uploaded to that session, and `READY`; anything else fails the whole message.
- The agent can show an image back: when a reply writes `[image:N]` on its own line, the UI renders the Nth image attached to that turn. The server drops markers that point past the attached images and stores those images on the agent message.
- Content is served only to the owner, `private, no-store`, `nosniff`; images inline, PDFs as downloads. Uploads are never public.
- Images and PDFs on a message are sent to the model inline for that turn (18 MB total cap). PDFs are also indexed, so later turns can cite them as `UPLOAD` sources, only inside the same session.
- Removing an attachment makes it unavailable; the stored object is kept (the storage interface has no delete).

## Explanation modes and research

`intent` on a message: `simpler`, `example`, `compare`, `tamil` adjust the explanation and search the topic being discussed rather than the follow-up wording; `research` turns on web search. Free open study always allows web search. Web citations are kept only if they are plain `https` URLs, de-duplicated and capped, and are labelled `WEB`. Web pages are untrusted like documents.

## Session memory

Every 10 messages the session's `rollingSummary` is refreshed by a short model call and added to later prompts, so long sessions stay coherent once older turns leave the history window. A failed summary never fails a reply.

## Student record

`services/student-record.service.js` builds a text snapshot of the signed-in student only (name, registration number, department, batch, current semester subjects with credits, results per semester, CGPA and semester GPAs, weak grades and the semester GPA needed for the next class band) from `academic-foundation`, `results` and `gpa-cgpa`, read-only. Every query is keyed on `principal.userId`. It is added to the system prompt on every message together with privacy rules: the model must never reveal another student's details. If loading fails the answer proceeds without it. Replies that use no source carry no "general knowledge" label.

## Not yet built

Past-paper analysis, quizzes, learning profile and mastery are later stages.
