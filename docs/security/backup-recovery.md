# Backup and recovery assumptions

This repository does **not** implement backup software.

Operational expectations:

- MongoDB backups are the source of restore for academic and audit data.
- Object storage backups cover uploaded files independently of Mongo metadata.
- Redis holds rate-limit keys and job lists. It is not the academic source of truth. Rebuilding Redis loses pending jobs unless they are re-enqueued from application state.
- Restoring Mongo without matching file objects can leave file records pointing at missing blobs — fail closed on download.
- Audit rows are append-only in application code; restoring from backup may replay history and must not be “fixed” by editing audit documents.
- Result import and CA PDF jobs must be retried idempotently after restore.

No legal retention period is encoded as a deletion job.
