import { TooManyRequestsError } from '../../../shared/errors/app-error.js';
import { StaffAgentUsage } from '../models/index.js';

const buckets = new Map();

/** Per-user, per-agent, per-minute limiter (process-local, same approach as the Study Agent). */
export function assertMinuteLimit(userId, agent, { max, now = Date.now() }) {
  const key = `${agent}:${userId}`;
  if (buckets.size > 5000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(bucketKey);
      }
    }
  }
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  if (current.count >= max) {
    throw new TooManyRequestsError('Slow down a little: too many assistant messages this minute');
  }
  current.count += 1;
}

export function resetMinuteLimits() {
  buckets.clear();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Counts one AI request against the user's daily allowance. */
export async function consumeDailyAllowance(userId, agent, { max }) {
  const usage = await StaffAgentUsage.findOneAndUpdate(
    { userId, agent, day: today() },
    { $inc: { requests: 1 } },
    { upsert: true, new: true },
  );
  if (usage.requests > max) {
    throw new TooManyRequestsError('Daily assistant limit reached. Try again tomorrow.');
  }
}

export async function recordTokenUsage(userId, agent, usage = {}) {
  await StaffAgentUsage.updateOne(
    { userId, agent, day: today() },
    { $inc: { inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0 } },
  );
}
