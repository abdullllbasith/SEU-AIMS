# notifications

**Owns:** Notification records, channel selection, scheduling, delivery status, retries; coordinates email and WhatsApp adapters.

**Must not own:** Recipient invention from untrusted frontend payloads; Meta request construction belongs in infrastructure.

**Implementation:** Prompt 10. This prompt only establishes ownership and a public module API.

Import `index.js` from other modules. Do not reach into future repositories, models, or private helpers.
