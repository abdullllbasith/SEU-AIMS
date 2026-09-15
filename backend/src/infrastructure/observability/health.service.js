export async function liveness() {
  return {
    status: 'ok',
    service: 'seu-aims-api',
    check: 'live',
  };
}

export async function readiness({ config, infrastructure } = {}) {
  const dependencies = {
    mongodb: Boolean(config?.mongo?.uri),
    redis: Boolean(infrastructure?.redis || config?.redis?.url),
    storage: Boolean(infrastructure?.storage),
    queue: Boolean(infrastructure?.queue),
    email: infrastructure?.email ? 'configured' : 'missing',
    whatsapp: infrastructure?.whatsapp ? 'configured' : 'missing',
    malwareScanner: infrastructure?.malwareScanner ? 'configured' : 'missing',
  };

  const ready = Boolean(config?.auth?.jwtSecret);
  return {
    status: ready ? 'ready' : 'not_ready',
    check: 'ready',
    dependencies,
    notes: {
      email: 'Provider outage must not mark the process dead.',
      whatsapp: 'Unconfigured WhatsApp fails closed for that channel only.',
      malwareScanner: 'Unconfigured scanner must not mark files clean.',
    },
  };
}

export function queueSnapshot(queue) {
  if (!queue) {
    return { adapter: 'missing', depth: 0, failed: 0 };
  }
  return {
    adapter: queue.constructor?.name || 'unknown',
    depth: Array.isArray(queue.pending) ? queue.pending.length : Array.isArray(queue.jobs) ? queue.jobs.length : null,
    failed: Array.isArray(queue.failed) ? queue.failed.length : 0,
    oldestEnqueuedAt: queue.pending?.[0]?.enqueuedAt || queue.jobs?.[0]?.enqueuedAt || null,
  };
}
