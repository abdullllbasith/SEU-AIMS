import { DASHBOARD_CACHE_TTL_MS } from '../constants.js';

const cache = new Map();

export function dashboardCacheKey({ userId, assignmentVersion }) {
  return `dashboard:lecturer:${userId}:${assignmentVersion || 'none'}`;
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

export function setDashboardCache(key, value, ttlMs = DASHBOARD_CACHE_TTL_MS) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateDashboardCacheForUser(userId) {
  const prefix = `dashboard:lecturer:${userId}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}
