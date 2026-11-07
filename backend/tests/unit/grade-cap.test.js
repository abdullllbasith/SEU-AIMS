import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAP_TREATMENTS,
  GRADE_CAP_MODES,
  evaluateRepeatCap,
  resolveGradeCapMode,
  resolveRepeatGrade,
  treatmentFor,
} from '../../src/modules/results/services/grade-cap.js';
import { resolveRepeatOfficialGrade } from '../../src/modules/results/services/repeat-grade.js';
import { DICT_GRADE_POINTS } from '../../src/modules/results/constants.js';

const CURRENT = [undefined, '', 'A+', 'A', 'B', 'C', 'C-', 'D', 'E', 'E(CA)', 'E(ESA)', 'E(CA&ESA)', 'AB'];
const INCOMING = [...Object.keys(DICT_GRADE_POINTS), 'E(CA)', 'E(ESA)', 'E(CA&ESA)', 'AB'];

test('LEGACY mode returns exactly the legacy decision for every current and incoming pair', () => {
  for (const current of CURRENT) {
    for (const incoming of INCOMING) {
      assert.deepEqual(
        resolveRepeatGrade(current, incoming, { mode: GRADE_CAP_MODES.LEGACY }),
        resolveRepeatOfficialGrade(current, incoming),
        `${current} -> ${incoming}`,
      );
    }
  }
});

test('the unified policy differs from legacy only for E, D and C- repeats above C', () => {
  const differing = [];
  for (const current of CURRENT) {
    for (const incoming of INCOMING) {
      const unified = evaluateRepeatCap(current, incoming);
      const legacy = resolveRepeatOfficialGrade(current, incoming);
      if (unified.officialResultCode !== legacy.officialResultCode || unified.gradeCapApplied !== legacy.gradeCapApplied) {
        differing.push([current, incoming]);
      }
    }
  }
  assert.ok(differing.length > 0);
  for (const [current, incoming] of differing) {
    assert.ok(['E', 'D', 'C-'].includes(current), `${current} must be a confirmed cap source`);
    assert.ok(DICT_GRADE_POINTS[incoming] > DICT_GRADE_POINTS.C, `${incoming} must be above C`);
  }
});

test('E, D and C- cap to C when the repeat grade is above C, and keep lower grades', () => {
  for (const current of ['E', 'D', 'C-']) {
    const capped = evaluateRepeatCap(current, 'A+');
    assert.equal(capped.officialResultCode, 'C');
    assert.equal(capped.rawResultCode, 'A+');
    assert.equal(capped.gradeCapApplied, true);
    assert.equal(capped.gradeCapReason, current);
    assert.equal(capped.treatment, CAP_TREATMENTS.AUTO_CAP);
  }
  assert.equal(evaluateRepeatCap('E', 'C').gradeCapApplied, false);
  assert.equal(evaluateRepeatCap('E', 'D').officialResultCode, 'D');
  assert.equal(evaluateRepeatCap('D', 'C-').officialResultCode, 'C-');
});

test('unconfirmed markers keep legacy handling, including the E(ESA) cap and the E(CA) review', () => {
  for (const current of ['E(ESA)', 'E(CA&ESA)', 'E(CA)']) {
    assert.equal(treatmentFor(current), CAP_TREATMENTS.LEGACY_PRESERVED_UNCONFIRMED);
  }
  assert.equal(evaluateRepeatCap('E(ESA)', 'A+').officialResultCode, 'C');
  const eca = evaluateRepeatCap('E(CA)', 'A+');
  assert.equal(eca.officialResultCode, 'E(CA)');
  assert.equal(eca.reviewRequired, true);
  assert.equal(eca.gradeCapApplied, false);
});

test('other current grades and absence are not capped', () => {
  for (const current of [undefined, 'A+', 'B', 'C', 'AB']) {
    assert.equal(treatmentFor(current), CAP_TREATMENTS.NO_CAP);
    assert.equal(evaluateRepeatCap(current, 'A+').officialResultCode, 'A+');
  }
});

test('SHADOW mode keeps the legacy grade and reports the difference', () => {
  const shadow = resolveRepeatGrade('E', 'A+', { mode: GRADE_CAP_MODES.SHADOW });
  assert.equal(shadow.officialResultCode, 'A+');
  assert.equal(shadow.gradeCapApplied, false);
  assert.equal(shadow.capShadowDiff.unifiedOfficialResultCode, 'C');
  assert.equal(shadow.capShadowDiff.legacyOfficialResultCode, 'A+');
  const same = resolveRepeatGrade('E(ESA)', 'A+', { mode: GRADE_CAP_MODES.SHADOW });
  assert.equal('capShadowDiff' in same, false);
});

test('ENFORCED mode applies the unified decision', () => {
  assert.equal(resolveRepeatGrade('E', 'A+', { mode: GRADE_CAP_MODES.ENFORCED }).officialResultCode, 'C');
});

test('the flag defaults to LEGACY and invalid values fall back to LEGACY', () => {
  assert.equal(resolveGradeCapMode({ features: {} }), 'LEGACY');
  assert.equal(resolveGradeCapMode({ features: { gradeCapMode: 'BOGUS' } }), 'LEGACY');
  assert.equal(resolveGradeCapMode({ features: { gradeCapMode: 'SHADOW' } }), 'SHADOW');
  assert.equal(resolveRepeatGrade('E', 'A+').officialResultCode, 'A+');
});
