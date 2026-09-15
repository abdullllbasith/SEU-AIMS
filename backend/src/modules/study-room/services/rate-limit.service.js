const buckets = new Map();

export function consumeRateLimit(key, { max, windowMs }) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1 };
  }
  if (current.count >= max) {
    return { allowed: false, remaining: 0, retryAt: current.resetAt };
  }
  current.count += 1;
  return { allowed: true, remaining: max - current.count };
}

export function assertRateLimit(key, options, TooManyRequestsError) {
  const result = consumeRateLimit(key, options);
  if (!result.allowed) {
    throw new TooManyRequestsError('Too many Study Room requests');
  }
  return result;
}
