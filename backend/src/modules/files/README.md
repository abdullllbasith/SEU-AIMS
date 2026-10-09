# files

**Owns:** File metadata, storage references, upload lifecycle, quarantine, scan state, controlled access abstraction.

**Must not own:** Domain authorization such as who may download a CA PDF. A URL is not the full file model.

Production `FILE_STORAGE_DRIVER=local_dev` is rejected at startup. Non-local drivers are not implemented yet (put/get fail closed).

`GET /api/files/admin/reconciliation` compares this department's file records with stored objects. It reports a missing object, a size or hash mismatch, and a file marked available without a safe scan. It does not delete objects, change availability, or return storage keys, filenames, or file bytes. Objects that have no file record are not listed, because storage has no list operation. Retention periods are not invented here.
