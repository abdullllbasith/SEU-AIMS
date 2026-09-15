# Environment variables

Never put real values in git. Names only. Canonical template: [`.env.example`](../../.env.example).

| Name | Purpose | Safe to expose in the browser? |
|---|---|---|
| `NODE_ENV` | `development` / `test` / `production` | no (process) |
| `LOG_LEVEL` | Logging; production rejects `debug` | no |
| `API_HOST` / `API_PORT` | Bind address | no |
| `API_PUBLIC_URL` | Links (CA QR). Production must not be localhost | public URL only |
| `CORS_ORIGIN` | Browser origin. Production must be explicit, not `*` or localhost | origin string |
| `VITE_API_BASE_URL` | Frontend API prefix, default `/api` | yes |
| `VITE_API_ORIGIN` | Socket origin override | yes if used |
| `AUTH_JWT_SECRET` | JWT signing | **no** |
| `AUTH_*_TTL_*` / `AUTH_PASSWORD_MIN_LENGTH` / cookie names | Session policy | no |
| `MONGODB_URI` / `MONGODB_TEST_URI` | Database | **no** |
| `MONGODB_MAX_POOL_SIZE` / `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | Pool | no |
| `REDIS_URL` / `REDIS_QUEUE_PREFIX` | Redis | **no** |
| `TRUST_PROXY` | Proxy hops (`0` = off) | no |
| `FILE_STORAGE_*` | Files. `local_dev` forbidden in production | **no** (keys) |
| `EMAIL_*` | Email adapter | **no** |
| `WHATSAPP_CLOUD_API_*` | Meta Cloud API + webhook | **no** |
| `PROVIDER_TIMEOUT_MS` | Outbound HTTP timeout | no |
| `MALWARE_SCANNER_*` / `FILE_MAX_BYTES` | Scanner | **no** |
| `JSON_BODY_LIMIT` / `RATE_LIMIT_*` | HTTP limits | no |
| `NOTIFICATION_RETRY_MAX` / `NOTIFICATION_DEFAULT_LOCALE` | Notifications | no |
| `AUDIT_RETENTION_DAYS` | `0` = do not auto-delete | no |
| `TZ` | Default `Asia/Colombo` | no |
| `STUDY_ROOM_*` | Chat rate/size caps (optional overrides) | no |

Production also requires Secure cookies (`NODE_ENV=production`).
