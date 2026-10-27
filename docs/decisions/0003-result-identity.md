# 0003 — Official result identity

## Status

Accepted (results module).

## Decision

The canonical official result identity is **registration number + subject code** (unique index). Repeat imports update that row and append `ResultRevision`. Students are not created from unmatched import rows. Subject titles in files are preview-only.

## Consequences

Parsers fail closed without those tokens. GPA reads official rows; it does not keep a second grade store.
