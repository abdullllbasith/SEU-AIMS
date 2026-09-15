# files

**Owns:** File metadata, storage references, upload lifecycle, quarantine, scan state, controlled access abstraction.

**Must not own:** Domain authorization such as who may download a CA PDF. A URL is not the full file model.

Production `FILE_STORAGE_DRIVER=local_dev` is rejected at startup. Non-local drivers are not implemented yet (put/get fail closed).
