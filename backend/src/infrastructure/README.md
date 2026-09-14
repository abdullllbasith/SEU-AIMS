# Infrastructure

Technical integrations:

- `database/` — MongoDB connection lifecycle
- `redis/` — shared Redis client
- `queue/` — job enqueue abstraction
- `storage/` — file/object storage interface
- `providers/` — email, Meta WhatsApp Cloud API, malware scanner
- `realtime/` — Socket.IO server construction
- `logging/` — structured logs (no secrets, no E2E plaintext)

Who receives a CA reminder is a domain question. How WhatsApp is called is an infrastructure question.
