const cache = new Map();
const DEFAULT_TTL_MS = 15_000;

export function dashboardCacheKey({ userId, contextVersion, gpaVersion }) {
  return `dashboard:student:${userId}:${contextVersion || 'none'}:${gpaVersion || 'none'}`;
}

export function getDashboardCache(key) {
  const row = cache.get(key);
  if (!row) {
    return null;
  }
  if (row.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return row.value;
}

export function setDashboardCache(key, value, ttlMs = DEFAULT_TTL_MS) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateDashboardCacheForUser(userId) {
  const prefix = `dashboard:student:${userId}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}
