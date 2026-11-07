/**
 * Opportunity and counted-attempt rules (plan 4.6, handbook R10 to R12). Pure, no I/O.
 * Opportunities are chronological. Only some opportunities count toward the repeat limit.
 * Repeat limit of 3 is an assumption (policy question 3), so it is a parameter.
 */

export const ATTEMPT_OUTCOMES = Object.freeze({
  SAT: 'SAT',
  ABSENT: 'ABSENT',
  ABSENT_PENDING_MEDICAL: 'ABSENT_PENDING_MEDICAL',
  ABSENT_MEDICAL_APPROVED: 'ABSENT_MEDICAL_APPROVED',
  NOT_REGISTERED_LAPSED: 'NOT_REGISTERED_LAPSED',
  CANCELLED_MISCONDUCT: 'CANCELLED_MISCONDUCT',
  VOIDED: 'VOIDED',
});

export const CANDIDATE_STATUS = Object.freeze({ FRESH: 'FRESH', REPEAT: 'REPEAT' });

export const DEFAULT_MAX_REPEATS = 3;

/** Outcomes that never consume a repeat. PENDING is not counted yet but is flagged. */
const NOT_COUNTED = new Set([
  ATTEMPT_OUTCOMES.ABSENT_MEDICAL_APPROVED,
  ATTEMPT_OUTCOMES.ABSENT_PENDING_MEDICAL,
  ATTEMPT_OUTCOMES.VOIDED,
]);

/**
 * @param {Array<{outcome: string}>} history earlier opportunities for one subject and component, oldest first
 * @returns {{counted: boolean, candidateStatus: string, repeatsUsed: number}}
 *   candidateStatus is for the NEXT opportunity: FRESH until a counted opportunity forfeits it.
 *   A counted first sitting (any outcome) makes every later sitting REPEAT.
 */
export function summarizeAttempts(history = []) {
  let countedSoFar = 0;
  for (const attempt of history) {
    if (!NOT_COUNTED.has(attempt.outcome)) {
      countedSoFar += 1;
    }
  }
  return {
    countedSoFar,
    candidateStatus: countedSoFar === 0 ? CANDIDATE_STATUS.FRESH : CANDIDATE_STATUS.REPEAT,
    repeatsUsed: Math.max(0, countedSoFar - 1),
    pendingMedical: history.some((a) => a.outcome === ATTEMPT_OUTCOMES.ABSENT_PENDING_MEDICAL),
  };
}

export function isCountedOutcome(outcome) {
  return !NOT_COUNTED.has(outcome);
}

/**
 * Decide whether a new opportunity may be opened. A repeat beyond the limit is refused
 * unless a grace chance (Board or Senate reference) exists.
 */
export function canOpenAttempt(history = [], { maxRepeats = DEFAULT_MAX_REPEATS, hasGraceChance = false } = {}) {
  const summary = summarizeAttempts(history);
  if (summary.repeatsUsed >= maxRepeats && !hasGraceChance) {
    return { allowed: false, reason: 'REPEAT_LIMIT_REACHED', ...summary };
  }
  return { allowed: true, reason: null, ...summary };
}
