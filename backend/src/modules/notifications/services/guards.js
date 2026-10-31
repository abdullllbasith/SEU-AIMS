/**
 * Pre-send guards. A source module registers a guard for its notifications so that a message that became
 * stale (exam cancelled, rescheduled, subject completed) is cancelled at release/send time instead of sent.
 * A guard receives the Notification document and returns { ok: true } or { ok: false, reason }.
 */
const guards = new Map();

export function registerNotificationGuard(sourceModule, guard) {
  guards.set(sourceModule, guard);
}

export async function runNotificationGuard(notification) {
  const guard = guards.get(notification.sourceModule);
  if (!guard) {
    return { ok: true };
  }
  try {
    return (await guard(notification)) || { ok: true };
  } catch {
    // A guard failure must not send a message that could not be verified as still valid.
    return { ok: false, reason: 'guard_error', retry: true };
  }
}
