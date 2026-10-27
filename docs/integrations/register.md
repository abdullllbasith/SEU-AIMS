# External integrations

Implemented **adapters**, not guaranteed live services.

| Integration | Config | Behavior in this repo |
|---|---|---|
| Email | `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_API_KEY` | Default `noop`; no delivery proof |
| Meta WhatsApp Cloud API | `WHATSAPP_CLOUD_API_*` | HTTP adapter + webhook HMAC; noop without token |
| Malware scanner | `MALWARE_SCANNER_*` | Default noop; **must not** mark files clean |
| MongoDB | `MONGODB_URI` | Authoritative store |
| Redis | `REDIS_URL` | Rate limit, job lists, Socket.IO adapter |
| Object storage | `FILE_STORAGE_*` | `local_dev` only implemented |
| Vite / browsers | `VITE_*` | Public config only |

## Webhooks

`GET|POST /api/webhooks/whatsapp` — not session-authenticated. Verify token on GET; `X-Hub-Signature-256` on POST. Do not put app secrets in docs.

Timeouts: `PROVIDER_TIMEOUT_MS` (default 10000).
