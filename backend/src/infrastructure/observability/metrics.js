const counters = new Map();

export function incrementMetric(name, by = 1) {
  counters.set(name, (counters.get(name) || 0) + by);
}

export function observeDuration(name, ms) {
  incrementMetric(`${name}.count`);
  incrementMetric(`${name}.duration_ms_sum`, Math.max(0, Math.round(ms)));
}

export function snapshotMetrics() {
  return Object.fromEntries(counters.entries());
}

export function resetMetricsForTests() {
  counters.clear();
}
