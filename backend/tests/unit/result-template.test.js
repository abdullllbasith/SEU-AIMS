import assert from 'node:assert/strict';
import test from 'node:test';
import { parseXlsxResults } from '../../src/modules/results/services/xlsx-parser.js';
import { buildResultImportTemplate } from '../../src/modules/results/services/result-template.js';

test('result template matches the exam sheet and keeps both result grids', async () => {
  const buffer = await buildResultImportTemplate();
  const parsed = await parseXlsxResults(buffer);
  assert.deepEqual(
    parsed.rows.map((row) => `${row.registrationNumber}:${row.subjectCode}:${row.resultCode}`).sort(),
    ['SEU/IS/00/ICT/000:CMS12012:A', 'SEU/IS/00/ICT/001:CMS12012:C'],
  );
  assert.equal(parsed.rows.filter((row) => row.resultCode === '-').length, 0);
});
