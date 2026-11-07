import assert from 'node:assert/strict';
import test from 'node:test';
import { getAssessmentScheme } from '../../src/modules/academic-foundation/services/assessment-schemes.js';
import { checkComponentPasses, validateComponentMarks } from '../../src/modules/assessment/rules/assessment-rules.js';
import { computeFinalMark } from '../../src/modules/assessment/rules/final-mark.js';
import {
  ATTEMPT_OUTCOMES as O,
  CANDIDATE_STATUS,
  canOpenAttempt,
  summarizeAttempts,
} from '../../src/modules/assessment/rules/attempt-counting.js';

const S4060 = getAssessmentScheme('CIS11012');
const S100 = getAssessmentScheme('SWT40016');
const UNVERIFIED = getAssessmentScheme('CMS11041');

test('final mark is weighted and needs every applicable component', () => {
  assert.equal(computeFinalMark(S4060, { CA: 50, ESA: 80 }), 68);
  assert.equal(computeFinalMark(S4060, { CA: 50 }), null);
  assert.equal(computeFinalMark(S100, { CA: 72.5 }), 72.5);
  assert.equal(computeFinalMark(UNVERIFIED, { CA: 50, ESA: 50 }), null);
});

test('100/0 scheme refuses an ESA mark and never pass-checks ESA', () => {
  assert.deepEqual(validateComponentMarks(S100, { CA: 60, ESA: 50 }), ['ESA_NOT_APPLICABLE']);
  assert.deepEqual(validateComponentMarks(S100, { CA: 60 }), []);
  assert.deepEqual(checkComponentPasses(S100, { CA: 60 }).ESA, { applicable: false, passed: null });
});

test('component pass uses 40 and 35 and is independent of the weighted mark', () => {
  const p = checkComponentPasses(S4060, { CA: 39, ESA: 35 });
  assert.equal(p.CA.passed, false);
  assert.equal(p.ESA.passed, true);
  assert.equal(computeFinalMark(S4060, { CA: 39, ESA: 100 }) > 50, true);
});

test('invalid and unverified schemes are rejected', () => {
  assert.deepEqual(validateComponentMarks(UNVERIFIED, { CA: 50 }), ['SCHEME_NOT_VERIFIED']);
  assert.deepEqual(validateComponentMarks(null, {}), ['SCHEME_NOT_VERIFIED']);
  assert.deepEqual(validateComponentMarks(S4060, { CA: 101, ESA: -1 }), ['CA_OUT_OF_RANGE', 'ESA_OUT_OF_RANGE']);
});

test('no history is FRESH; first counted sitting of any outcome forfeits fresh', () => {
  assert.equal(summarizeAttempts([]).candidateStatus, CANDIDATE_STATUS.FRESH);
  for (const outcome of [O.SAT, O.ABSENT, O.NOT_REGISTERED_LAPSED, O.CANCELLED_MISCONDUCT]) {
    const s = summarizeAttempts([{ outcome }]);
    assert.equal(s.candidateStatus, CANDIDATE_STATUS.REPEAT, outcome);
    assert.equal(s.repeatsUsed, 0);
  }
});

test('approved medical, pending medical and voided do not count', () => {
  for (const outcome of [O.ABSENT_MEDICAL_APPROVED, O.ABSENT_PENDING_MEDICAL, O.VOIDED]) {
    const s = summarizeAttempts([{ outcome }]);
    assert.equal(s.candidateStatus, CANDIDATE_STATUS.FRESH, outcome);
    assert.equal(s.countedSoFar, 0);
  }
  assert.equal(summarizeAttempts([{ outcome: O.ABSENT_PENDING_MEDICAL }]).pendingMedical, true);
});

test('repeat limit refuses a fourth repeat without a grace chance', () => {
  const sat = { outcome: O.SAT };
  assert.equal(canOpenAttempt([sat, sat, sat]).allowed, true);
  const four = [sat, sat, sat, sat];
  const refused = canOpenAttempt(four);
  assert.equal(refused.allowed, false);
  assert.equal(refused.reason, 'REPEAT_LIMIT_REACHED');
  assert.equal(canOpenAttempt(four, { hasGraceChance: true }).allowed, true);
  assert.equal(canOpenAttempt(four, { maxRepeats: 4 }).allowed, true);
});
