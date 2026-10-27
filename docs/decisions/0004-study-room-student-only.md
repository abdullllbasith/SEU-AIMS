# 0004 — Study Room is student-only

## Status

Accepted.

## Decision

Ordinary Study Room HTTP and Socket.IO access requires an active student with academic context. Lecturers cannot use Study Room as staff chat. Department administrators get **file moderation** routes only, not a chat backdoor. Messages store ciphertext fields, not plaintext.

## Consequences

Frontend `/study-room` is wrapped in `roles: [STUDENT]`. That is not sufficient by itself; API tests deny lecturers.
