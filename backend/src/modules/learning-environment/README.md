# learning-environment

**Owns:** Current and historical official learning access, resource sections, and lecturer/admin official resources for assigned subject offerings.

**Must not own:** Student Study Room sharing, a parallel academic hierarchy, malware vendor logic, or notification delivery providers.

Official resources belong to a **Subject Offering**, never only to a reusable Subject. Students see published, scanned-safe files for offerings matching their current or historical academic context (same batch + year + semester). Lecturers manage only offerings with an active assignment. Publication is a separate action from upload. Replacing a file keeps the same resource, stores the previous version, returns the resource to draft, and makes the previous file unavailable. Students do not receive the version list.

`GET /api/learning/admin/reconciliation` reports published resources whose file is missing or not safe. It does not unpublish them.

The default malware scanner adapter is unconfigured and does **not** mark files clean. Publication requires `scanStatus=SAFE`.

Import `index.js` from other modules.
