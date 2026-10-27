# Runbooks

Escalate to the infrastructure operator, not to a Department Administrator session. Do not paste student data into public tickets.

Department-admin dashboard runbooks: [admin-analytics.md](./admin-analytics.md).

## API outage

- **Symptoms:** proxy 502/504; `/api/health/live` fails.
- **Checks:** process up; `API_PORT`; Mongo/Redis from the host; recent deploy.
- **Safe actions:** restart API; roll back artifact; do not drop Mongo.
- **Verify:** live + ready + login.
- **Escalate:** host/network owner.

## Worker queue backlog

- **Symptoms:** `/api/ops/queues` depth rising; PDFs/scans delayed.
- **Checks:** worker process; Redis; job names in worker logs.
- **Safe actions:** start more workers; do not delete the Redis lists blindly.
- **Verify:** depth falls; one CA PDF or scan completes.
- **Escalate:** platform owner.

## MongoDB connectivity

- **Symptoms:** ready mongodb `down`; 5xx on data routes.
- **Checks:** URI in secret store (do not log it); firewall; disk on the database host.
- **Safe actions:** restore connectivity; restore from backup only with a documented restore test.
- **Verify:** a student results GET.
- **Escalate:** DBA.

## Redis issue

- **Symptoms:** shared rate limits differ per instance; jobs not seen by workers; Socket.IO rooms diverge.
- **Checks:** Redis ping from API/worker; `REDIS_URL`.
- **Safe actions:** restore Redis; API may use in-memory rate limit if Redis is missing (unsafe for multi-instance). Production start **requires** Redis.
- **Verify:** enqueue a job, worker drains it.
- **Escalate:** platform owner.

## File scanner outage

- **Symptoms:** uploads stay unscanned / not downloadable.
- **Checks:** `MALWARE_SCANNER_*`; worker `files.malware-scan`.
- **Safe actions:** leave files unavailable. Do **not** mark clean.
- **Verify:** executable still rejected; wait for scanner.
- **Escalate:** security operator.

## Email outage

- **Symptoms:** in-app notice exists, mailbox empty.
- **Checks:** `EMAIL_PROVIDER`; provider status.
- **Safe actions:** academic writes stay; retry delivery jobs.
- **Verify:** in-app notification present.
- **Escalate:** provider + ops.

## WhatsApp outage

- **Symptoms:** webhook 401; channel failed.
- **Checks:** app secret, verify token, HTTPS URL.
- **Safe actions:** keep in-app; do not disable signature checks.
- **Verify:** signed webhook 200.
- **Escalate:** Meta app admin.

## Certificate issue

- **Symptoms:** browser TLS error; webhook delivery fails.
- **Checks:** expiry; chain; HTTPS redirect.
- **Safe actions:** renew at the proxy; do not disable TLS verification in Node.
- **Verify:** HTTPS login.
- **Escalate:** DNS/TLS owner.

## Failed deployment

- **Symptoms:** health fail after rollout.
- **Checks:** production config error in logs (no secret dump); lockfile.
- **Safe actions:** previous artifact; see checklists rollback.
- **Verify:** smoke.
- **Escalate:** releaser.

## Object storage outage

- **Symptoms:** uploads return an error; downloads of already stored files fail; file reconciliation reports missing objects.
- **Checks:** `FILE_STORAGE_DRIVER`; storage credentials; bucket reachability. Do not log the secret.
- **Safe actions:** leave new uploads failed. Do not mark a missing object as available. Academic rows are not deleted to “fix” a missing file.
- **Verify:** one known safe file downloads after storage returns; reconciliation no longer reports that object missing.
- **Escalate:** storage operator. A restore of objects was **not** demonstrated in this repository.

## Malware found

- **Symptoms:** scan result is not safe; the file stays unavailable.
- **Checks:** worker log for `files.malware-scan`; stored-file status. Do not download the bytes onto an operator laptop to “check”.
- **Safe actions:** keep the file unavailable. Do not set it clean by hand. Preserve the audit row.
- **Verify:** students and lecturers still cannot download it.
- **Escalate:** security operator.

## Notification provider outage

- **Symptoms:** in-app notices exist; email or WhatsApp deliveries fail or retry.
- **Checks:** provider status; delivery rows; worker is running.
- **Safe actions:** leave the academic record as written. Retry delivery. Do not turn a failed send into a second official result or CA decision.
- **Verify:** the in-app notification is still the user’s copy; a later retry does not create a second academic row.
- **Escalate:** provider owner.

## Security incident

- **Symptoms:** unexpected admin audit events, credential leak, or a report of cross-department data.
- **Checks:** `GET /api/audit/events` for the affected department; rotate the leaked secret in the secret store.
- **Safe actions:** disable the affected account (`SUSPENDED`). Do not edit or delete audit documents. Roll the JWT secret only with a planned logout of all sessions.
- **Verify:** the suspended account receives 401; a fresh login with the old password fails.
- **Escalate:** security operator. Do not paste registration numbers or message text into a public ticket.

## Database restore

- **Symptoms:** corruption or accidental drop.
- **Checks:** backup completeness; object-storage match.
- **Safe actions:** restore Mongo; files separately; **do not edit audit documents**.
- **Verify:** integrity endpoint; sample registration + subject result.
- **Escalate:** DBA. Restore was **not** demonstrated in this repository.
