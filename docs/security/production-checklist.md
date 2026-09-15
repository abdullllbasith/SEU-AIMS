# Production configuration checklist

Do not mark an item verified unless it has been set in the real environment.

| Item | Required | Status in repo |
|---|---|---|
| HTTPS / TLS at the reverse proxy | Yes | Not terminated in this Node process |
| `AUTH_JWT_SECRET` strong, not committed | Yes | Empty in `.env.example` |
| Secure cookies (`NODE_ENV=production`) | Yes | `cookieSecure` follows production flag |
| Explicit `CORS_ORIGIN` (not `*`) | Yes | Example is localhost |
| Frontend CSP | Yes | Dev `index.html` includes localhost connect-src; production Vite build strips it |
| Redis for shared rate limits and job lists | Yes in production | Production gate requires `REDIS_URL`; HTTP limiter uses Redis when connected |
| MongoDB URI | Yes | Example localhost |
| Object storage not `local_dev` | Yes | Validated in production config gate; S3-compatible adapter still unconfigured (uploads fail closed) |
| Malware scanner not noop | Strongly recommended | Noop fails closed (files stay unscanned) |
| Email/WhatsApp credentials | If those channels are used | Noop otherwise |
| WhatsApp webhook app secret | If webhooks are enabled | Unsigned POST is rejected |
| Log redaction | Yes | Implemented for known secret keys |
| Backups | Institutional | Not automated in this repository |
| Audit retention days | Institutional policy | `AUDIT_RETENTION_DAYS=0` means unset |
| Secret pattern scan | CI | `npm run check:secrets` |

`assertProductionConfig` refuses to start the API **and worker** in `NODE_ENV=production` when JWT, CORS, Mongo, Redis, storage driver, localhost public URL/CORS, or `LOG_LEVEL=debug` are unsafe/missing.

CI includes the working-tree secret pattern scan. `npm audit --omit=dev` remains the production advisory gate.

See [dependency-advisories.md](./dependency-advisories.md) for the Prompt 12 follow-up: `exceljs`/`uuid` was overridden to `uuid@11.1.1`; Vitest 3.x remains an accepted test-only residual until a dedicated Vitest major upgrade.
