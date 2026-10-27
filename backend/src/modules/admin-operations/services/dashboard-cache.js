import { DASHBOARD_CACHE_TTL_MS } from '../constants.js';

const cache = new Map();

export function getAdminDashboardCache(departmentId) {
  const row = cache.get(String(departmentId));
  if (!row) {
    return null;
  }
  if (row.expiresAt < Date.now()) {
    cache.delete(String(departmentId));
    return null;
  }
  return row.value;
}

export function setAdminDashboardCache(departmentId, value, ttlMs = DASHBOARD_CACHE_TTL_MS) {
  cache.set(String(departmentId), { value, expiresAt: Date.now() + ttlMs });
}

export function clearAdminDashboardCache() {
  cache.clear();
}
