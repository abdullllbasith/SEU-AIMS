import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { DICT_SEUSL_CATALOG } from '../../src/modules/academic-foundation/data/dict-seusl-catalog.js';
import {
  getAssessmentScheme,
  listSchemeCodes,
  validateAssessmentComponents,
} from '../../src/modules/academic-foundation/services/assessment-schemes.js';

const HANDBOOK = 'G:/IAD Project/Architecture/ICT_BICT_Handbook_Extract.md';

function weights(code) {
  const scheme = getAssessmentScheme(code);
  return scheme.components.map((component) => `${component.key}:${component.weight}`).join(' ');
}

test('the scheme file covers 97 course codes with the handbook weight groups', () => {
  const codes = listSchemeCodes();
  assert.equal(codes.length, 97);
  const groups = {};
  for (const code of codes) {
    const scheme = getAssessmentScheme(code);
    const key = scheme.status === 'VERIFIED' ? weights(code) : 'UNVERIFIED';
    groups[key] = (groups[key] || 0) + 1;
  }
  assert.deepEqual(groups, {
    'CA:40 ESA:60': 52,
    'CA:50 ESA:50': 37,
    'CA:60 ESA:40': 3,
    'CA:100 ESA:null': 4,
    UNVERIFIED: 1,
  });
});

test('named exceptions match the handbook', () => {
  for (const code of ['CMS31022', 'NST32021', 'SWT32031']) {
    assert.equal(weights(code), 'CA:60 ESA:40');
  }
  for (const code of ['SWT40016', 'NST40046', 'SWT42016', 'NST42016']) {
    assert.equal(weights(code), 'CA:100 ESA:null');
  }
});

test('a 100/0 course has no ESA component to check', () => {
  const esa = getAssessmentScheme('SWT40016').components.find((component) => component.key === 'ESA');
  assert.equal(esa.applicable, false);
  assert.equal(esa.weight, null);
  assert.equal(esa.passMark, null);
});

test('CMS11041 is unverified and has no weights', () => {
  const scheme = getAssessmentScheme('CMS11041');
  assert.equal(scheme.status, 'UNVERIFIED');
  assert.deepEqual(scheme.components, []);
});

test('unknown codes have no scheme and lookups ignore case and spaces', () => {
  assert.equal(getAssessmentScheme('ZZZ99999'), null);
  assert.equal(getAssessmentScheme(' cis11012 ').status, 'VERIFIED');
});

test('every scheme code exists in the vendored catalog, and the six NGPA codes match', () => {
  const catalogCodes = new Set(DICT_SEUSL_CATALOG.courses.map((course) => course.code));
  for (const code of listSchemeCodes()) {
    assert.ok(catalogCodes.has(code), `${code} missing from catalog`);
  }
  const ngpa = DICT_SEUSL_CATALOG.courses.filter((course) => !course.countsForGpa).map((course) => course.code);
  assert.deepEqual([...new Set(ngpa)].sort(), ['CMS11022', 'CMS11031', 'CMS11041', 'CMS12022', 'NST42016', 'SWT42016']);
});

test('each scheme equals the handbook extract', { skip: !existsSync(HANDBOOK) && 'handbook extract not available' }, () => {
  const expected = new Map();
  for (const line of readFileSync(HANDBOOK, 'utf8').split(/\r?\n/)) {
    if (!/^\|[A-Z]{3}[0-9]{5}\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    expected.set(cells[0], { ca: cells.at(-2), esa: cells.at(-1) });
  }
  assert.equal(expected.size, 97);
  for (const [code, cell] of expected) {
    const scheme = getAssessmentScheme(code);
    if (cell.ca === '' && cell.esa === '') {
      assert.equal(scheme.status, 'UNVERIFIED', code);
    } else {
      const [ca, esa] = scheme.components;
      assert.equal(ca.weight, Number(cell.ca), code);
      assert.equal(esa.weight, cell.esa === '' ? null : Number(cell.esa), code);
    }
  }
});

test('component validation requires weights summing to 100 and no weight on a non-applicable component', () => {
  const ok = [
    { key: 'CA', applicable: true, weight: 40, passMark: 40 },
    { key: 'ESA', applicable: true, weight: 60, passMark: 35 },
  ];
  assert.deepEqual(validateAssessmentComponents(ok), []);
  assert.deepEqual(
    validateAssessmentComponents([
      { key: 'CA', applicable: true, weight: 100, passMark: 40 },
      { key: 'ESA', applicable: false, weight: null, passMark: null },
    ]),
    [],
  );
  assert.match(validateAssessmentComponents([{ ...ok[0], weight: 50 }, ok[1]]).join(), /sum to 100/);
  assert.match(
    validateAssessmentComponents([ok[0], { key: 'ESA', applicable: false, weight: 60, passMark: null }]).join(),
    /does not apply/,
  );
  assert.match(validateAssessmentComponents([]).join(), /At least one/);
});
