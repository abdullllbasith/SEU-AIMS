# Secrets

Never commit real credentials. Templates: `.env.example`, `backend/.env.example`.

## Rotation

| Secret | Rotate by | After rotation |
|---|---|---|
| `AUTH_JWT_SECRET` | generate a new secret, deploy API+worker together | existing sessions fail; users sign in again |
| Mongo URI | new user/password on the cluster, then deploy | old URI stops working immediately |
| Redis URI | new password/ACL, then deploy | rate limits reset; in-flight jobs on the old instance are lost |
| Object-storage keys | new key, deploy, disable old key | failed downloads until metadata matches |
| Email / WhatsApp / scanner | provider console, then deploy | channel outage until the new key works |

Do not bake secrets into Docker images, nginx configs, or GitHub Actions logs.

## Scanning

`npm run check:secrets` scans the working tree for private keys, AWS-style access keys, and passworded Mongo URIs. It does **not** scan git history.

If a real secret is found in history: revoke it, rotate it, then stop committing it. Deleting the string from HEAD is not enough.
