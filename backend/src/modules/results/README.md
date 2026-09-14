# results

**Owns:** Official result import, parse, validate, preview, admin confirm/commit, academic records, repeat-student matching by registration number + subject code.

**Must not own:** GPA formula or CA application workflow. Parser must not commit unconfirmed records.

**Implementation:** Prompt 08. This prompt only establishes ownership and a public module API.

Import `index.js` from other modules. Do not reach into future repositories, models, or private helpers.
