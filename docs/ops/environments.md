# Environments

| | development | test | staging | production |
|---|---|---|---|---|
| `NODE_ENV` | `development` | `test` | `production` (or `staging` if you add it) | `production` |
| Mongo | local / compose | memory server in automated tests | dedicated cluster | dedicated cluster + auth |
| Redis | local | usually unset (in-memory queue + process rate limit) | dedicated | dedicated |
| Files | `FILE_STORAGE_DRIVER=local_dev` | local_dev / unused | object storage | object storage (never `local_dev`) |
| CORS | `http://localhost:5173` | test origin | staging origin | real HTTPS origin |
| JWT | `.env` only | test secret | vault | vault |
| Providers | noop | noop | sandbox / test numbers | live credentials after verification |
| Logs | `debug` allowed | error | `info` | `info` (not `debug`) |

`assertProductionConfig` runs when `NODE_ENV=production`. It refuses missing JWT, wildcard/localhost CORS, missing Mongo/Redis, `local_dev` storage, localhost `API_PUBLIC_URL`, and `LOG_LEVEL=debug`.

Do not copy production student records into staging without an approved control. Do not point staging WhatsApp at a live student list.
