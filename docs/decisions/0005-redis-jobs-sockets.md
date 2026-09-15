# 0005 — Redis for shared jobs and sockets

## Status

Accepted for Prompt 15.

## Decision

When a Redis client is connected, the job queue uses Redis lists (priority high/normal/low) so API and worker processes share jobs. Socket.IO uses `@socket.io/redis-adapter` when Redis is connected. Tests and disconnected Redis still use in-memory queues / in-process adapter.

## Consequences

Production `assertProductionConfig` requires `REDIS_URL`. Multi-instance Study Room realtime is **wired, not load-tested**. Redis is not the academic source of truth.
