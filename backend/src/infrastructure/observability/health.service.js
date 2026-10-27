import mongoose from 'mongoose';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageJson = JSON.parse(
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../package.json'), 'utf8'),
);

export async function liveness() {
  return {
    status: 'ok',
    service: 'seu-aims-api',
    check: 'live',
    version: packageJson.version,
  };
}

function mongoState() {
  const state = mongoose.connection?.readyState;
  if (state === 1) {
    return 'up';
  }
  if (state === 2) {
    return 'connecting';
  }
  return 'down';
}

async function redisState(redis) {
  if (!redis) {
    return 'unconfigured';
  }
  if (typeof redis.ping !== 'function') {
    return redis.status || 'unknown';
  }
  try {
    const pong = await redis.ping();
    return pong ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

export async function readiness({ config, infrastructure } = {}) {
  const mongodb = mongoState();
  const redis = await redisState(infrastructure?.redis);
  const dependencies = {
    mongodb,
    redis,
    storage: infrastructure?.storage?.constructor?.name || 'missing',
    queue: infrastructure?.queue?.adapter || infrastructure?.queue?.constructor?.name || 'missing',
    email: infrastructure?.email ? 'configured' : 'missing',
    whatsapp: infrastructure?.whatsapp ? 'configured' : 'missing',
    malwareScanner: infrastructure?.malwareScanner ? 'configured' : 'missing',
  };

  const ready = Boolean(config?.auth?.jwtSecret);
  return {
    status: ready ? 'ready' : 'not_ready',
    check: 'ready',
    version: packageJson.version,
    dependencies,
    notes: {
      email: 'Provider outage must not mark the process dead.',
      whatsapp: 'Unconfigured WhatsApp fails closed for that channel only.',
      malwareScanner: 'Unconfigured scanner must not mark files clean.',
      mongodb: 'URI is never returned from health endpoints.',
      redis: 'Unconfigured Redis is not a liveness failure.',
    },
  };
}

export async function queueSnapshot(queue) {
  if (!queue) {
    return { adapter: 'missing', depth: 0, failed: 0 };
  }
  const depth = typeof queue.depth === 'function' ? await queue.depth() : null;
  return {
    adapter: queue.adapter || queue.constructor?.name || 'unknown',
    depth: depth || {
      pending: Array.isArray(queue.pending) ? queue.pending.length : null,
    },
    failed: depth?.failed ?? (Array.isArray(queue.failed) ? queue.failed.length : 0),
    oldestEnqueuedAt: queue.pending?.[0]?.enqueuedAt || queue.jobs?.[0]?.enqueuedAt || null,
  };
}
