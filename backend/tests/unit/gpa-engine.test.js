import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateWeightedGpa, classifyDegreeByGpa, gradePointFor, round2 } from '../../src/modules/gpa-cgpa/services/gpa-engine.js';
import { DICT_GRADE_POINTS } from '../../src/modules/results/constants.js';

/**
 * Frozen snapshot of DICT-SEUSL-GPA-Calculator app.js GRADE_POINTS
 * (https://github.com/abdullllbasith/DICT-SEUSL-GPA-Calculator, inspected 2026-09-15).
 * Do not add D+ or E(CA).
 */
const DICT_CALCULATOR_GRADE_POINTS = Object.freeze({
  'A+': 4.0,
  A: 4.0,
  'A-': 3.7,
  'B+': 3.3,
  B: 3.0,
  'B-': 2.7,
  'C+': 2.3,
  C: 2.0,
  'C-': 1.7,
  D: 1.3,
  E: 0.0,
});

test('DICT grade map matches the inspected calculator snapshot and has no D+', () => {
  assert.deepEqual({ ...DICT_GRADE_POINTS }, { ...DICT_CALCULATOR_GRADE_POINTS });
  for (const [marker, points] of Object.entries(DICT_CALCULATOR_GRADE_POINTS)) {
    assert.equal(gradePointFor(marker), points);
  }
  assert.equal(gradePointFor('D+'), null);
  assert.equal(gradePointFor('E(CA)'), null);
  assert.equal(Object.prototype.hasOwnProperty.call(DICT_GRADE_POINTS, 'D+'), false);
});

test('semester GPA uses credits times points over credits and round2', () => {
  const result = calculateWeightedGpa([
    { subjectCode: 'ICT1233', resultCode: 'A', credits: 3, countsForGpa: true },
    { subjectCode: 'ICT1242', resultCode: 'B', credits: 2, countsForGpa: true },
  ]);
  assert.equal(result.gpa, round2((3 * 4 + 2 * 3) / 5));
  assert.equal(result.gpa, 3.6);
});

test('E(CA) and unknown markers are excluded rather than mapped to E=0', () => {
  const result = calculateWeightedGpa([
    { subjectCode: 'ICT1233', resultCode: 'A', credits: 3, countsForGpa: true },
    { subjectCode: 'ICT1242', resultCode: 'E(CA)', credits: 2, countsForGpa: true },
    { subjectCode: 'ICT1252', resultCode: 'ABSENT', credits: 2, countsForGpa: true },
    { subjectCode: 'CMS1231', resultCode: 'A', credits: 1, countsForGpa: false },
  ]);
  assert.equal(result.gpa, 4);
  assert.equal(result.credits, 3);
  assert.equal(result.excluded.some((item) => item.resultCode === 'E(CA)'), true);
  assert.equal(result.excluded.some((item) => item.resultCode === 'ABSENT'), true);
});

test('class bands follow the calculator thresholds', () => {
  assert.equal(classifyDegreeByGpa(3.7), 'First Class');
  assert.equal(classifyDegreeByGpa(3.3), 'Second Class (Upper Division)');
  assert.equal(classifyDegreeByGpa(3.0), 'Second Class (Lower Division)');
  assert.equal(classifyDegreeByGpa(2.0), 'Pass');
  assert.equal(classifyDegreeByGpa(1.9), 'Degree Incomplete');
});
