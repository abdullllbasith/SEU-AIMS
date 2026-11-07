import assert from 'node:assert/strict';
import test from 'node:test';
import { gradeForFinalMark, proposeResultCode } from '../../src/modules/assessment/rules/grade-proposal.js';

test('band edges follow table 5.5.1', () => {
  const cases = [[85, 'A+'], [84, 'A'], [75, 'A'], [74, 'A-'], [70, 'A-'], [69, 'B+'], [65, 'B+'], [60, 'B'], [55, 'B-'],
    [50, 'C+'], [45, 'C'], [44, 'C-'], [40, 'C-'], [39, 'D'], [35, 'D'], [34, 'E'], [0, 'E']];
  for (const [mark, grade] of cases) {
    assert.equal(gradeForFinalMark(mark), grade, String(mark));
  }
  assert.equal(gradeForFinalMark(101), null);
  assert.equal(gradeForFinalMark(null), null);
});

test('failed components give the table 5.3 codes', () => {
  assert.equal(proposeResultCode({ caPassed: false, esaPassed: false, finalMark: 20 }), 'E(CA&ESA)');
  assert.equal(proposeResultCode({ caPassed: false, esaPassed: true, finalMark: 60 }), 'E(CA)');
  assert.equal(proposeResultCode({ caPassed: true, esaPassed: false, finalMark: 60 }), 'E(ESA)');
  assert.equal(proposeResultCode({ caPassed: true, esaPassed: true, finalMark: 68 }), 'B+');
});

test('missing input gives no proposal and a 100/0 scheme needs no ESA', () => {
  assert.equal(proposeResultCode({ caPassed: null, esaPassed: true, finalMark: 60 }), null);
  assert.equal(proposeResultCode({ caPassed: true, esaPassed: null, finalMark: 60 }), null);
  assert.equal(proposeResultCode({ caPassed: true, esaApplicable: false, finalMark: 72 }), 'A-');
  assert.equal(proposeResultCode({ caPassed: false, esaApplicable: false, finalMark: 30 }), 'E(CA)');
});
