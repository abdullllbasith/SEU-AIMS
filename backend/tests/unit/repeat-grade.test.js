import assert from 'node:assert/strict';
import test from 'node:test';
import { C_PASS_RESULT_CODE, resolveRepeatOfficialGrade } from '../../src/modules/results/services/repeat-grade.js';

test('E(ESA) and E(CA&ESA) grades above C Pass cap to official C', () => {
  for (const current of ['E(ESA)', 'E(CA&ESA)']) {
    const decision = resolveRepeatOfficialGrade(current, 'A+');
    assert.equal(decision.officialResultCode, C_PASS_RESULT_CODE);
    assert.equal(decision.rawResultCode, 'A+');
    assert.equal(decision.gradeCapApplied, true);
    assert.equal(decision.gradeCapReason, current);
    assert.equal(decision.reviewRequired, false);
    assert.match(decision.explanation, /C Pass/);
  }
});

test('grades at or below C Pass stay uncapped for ESA repeats', () => {
  const decision = resolveRepeatOfficialGrade('E(ESA)', 'C-');
  assert.equal(decision.officialResultCode, 'C-');
  assert.equal(decision.gradeCapApplied, false);
  assert.equal(decision.reviewRequired, false);
});

test('E(CA) recovery is pending review and is not capped', () => {
  const decision = resolveRepeatOfficialGrade('E(CA)', 'A+');
  assert.equal(decision.officialResultCode, 'E(CA)');
  assert.equal(decision.rawResultCode, 'A+');
  assert.equal(decision.gradeCapApplied, false);
  assert.equal(decision.reviewRequired, true);
});

test('ordinary attempts and ambiguous incomplete replacements are not silently mapped', () => {
  const ordinary = resolveRepeatOfficialGrade('B', 'A+');
  assert.equal(ordinary.officialResultCode, 'A+');
  assert.equal(ordinary.gradeCapApplied, false);
  const ambiguous = resolveRepeatOfficialGrade('E(ESA)', 'E(CA)');
  assert.equal(ambiguous.blockedReason, 'AMBIGUOUS_REPEAT_RESULT');
  assert.equal(ambiguous.officialResultCode, 'E(ESA)');
});
