import { TooManyRequestsError } from '../../../shared/errors/app-error.js';
import { AiUsage } from '../models/index.js';

const buckets = new Map();

/** Per-student, per-minute limiter (process-local, same approach as Study Room). */
export function assertMinuteLimit(studentUserId, { max, now = Date.now() }) {
  const key = String(studentUserId);
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
    throw new TooManyRequestsError('Slow down a little: too many Study Agent messages this minute');
  }
  current.count += 1;
}

export function resetMinuteLimits() {
  buckets.clear();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Counts one AI request against the student's daily allowance. */
export async function consumeDailyAllowance(studentUserId, { max }) {
  const usage = await AiUsage.findOneAndUpdate(
    { studentUserId, day: today() },
    { $inc: { requests: 1 } },
    { upsert: true, new: true },
  );
  if (usage.requests > max) {
    throw new TooManyRequestsError('Daily Study Agent limit reached. Try again tomorrow.');
  }
}

export async function recordTokenUsage(studentUserId, usage = {}) {
  await AiUsage.updateOne(
    { studentUserId, day: today() },
    { $inc: { inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0 } },
  );
}
