# files

**Owns:** File metadata, storage references, upload lifecycle, quarantine, scan state, controlled access abstraction.

**Must not own:** Domain authorization such as who may download a CA PDF. A URL is not the full file model.

**Implementation:** V2/V4 file prompts. This prompt only establishes ownership and a public module API.

Import `index.js` from other modules. Do not reach into future repositories, models, or private helpers.
