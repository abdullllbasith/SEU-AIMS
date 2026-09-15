# Production configuration checklist

Do not mark an item verified unless it has been set in the real environment.

| Item | Required | Status in repo |
|---|---|---|
| HTTPS / TLS at the reverse proxy | Yes | Not terminated in this Node process |
| `AUTH_JWT_SECRET` strong, not committed | Yes | Empty in `.env.example` |
| Secure cookies (`NODE_ENV=production`) | Yes | `cookieSecure` follows production flag |
| Explicit `CORS_ORIGIN` (not `*`) | Yes | Example is localhost |
| Frontend CSP | Yes | `index.html` meta CSP (dev origins included) |
| Redis for shared rate limits | Yes in multi-instance | In-memory fallback if unset |
| MongoDB URI | Yes | Example localhost |
| Object storage not `local_dev` | Yes | Validated in production config gate |
| Malware scanner not noop | Strongly recommended | Noop fails closed (files stay unscanned) |
| Email/WhatsApp credentials | If those channels are used | Noop otherwise |
| WhatsApp webhook app secret | If webhooks are enabled | Unsigned POST is rejected |
| Log redaction | Yes | Implemented for known secret keys |
| Backups | Institutional | Not automated in this repository |
| Audit retention days | Institutional policy | `AUDIT_RETENTION_DAYS=0` means unset |

`assertProductionConfig` refuses to start the API in `NODE_ENV=production` when JWT, CORS, Mongo, Redis, or storage driver are unsafe/missing.

CI in this repository currently does not include a secret scanner or dependency-advisory gate. `npm audit` must be run operationally; this prompt does not claim a clean scan unless that command was actually executed.

See [dependency-advisories.md](./dependency-advisories.md) for the Prompt 12 follow-up: `exceljs`/`uuid` was overridden to `uuid@11.1.1`; Vitest 3.x remains an accepted test-only residual until a dedicated Vitest major upgrade.
